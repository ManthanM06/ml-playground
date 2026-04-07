from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import torch.nn as nn
import torch.fx as fx
from torch.fx.passes.shape_prop import ShapeProp
import math

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TraceRequest(BaseModel):
    code: str
    input_shape: list[int]

@app.post("/trace")
def trace_model(req: TraceRequest):
    safe_globals = {"torch": torch, "nn": nn}
    safe_locals = {}

    try:
        exec(req.code, safe_globals, safe_locals)
    except Exception as e:
        return {"error": f"Code execution failed: {str(e)}"}

    if "model" not in safe_locals:
        return {"error": "You must define a variable named `model`"}

    model = safe_locals["model"]
    model.eval()

    try:
        traced = fx.symbolic_trace(model)
    except Exception as e:
        return {"error": f"FX tracing failed: {str(e)}"}

    try:
        dummy = torch.randn(*req.input_shape)
        ShapeProp(traced).propagate(dummy)
    except Exception as e:
        return {"error": f"Shape propagation failed: {str(e)}"}

    nodes = []
    edges = []
    
    # Create a map to find the actual layer object (to count params)
    # named_modules() returns: {'fc1': Linear(...), 'relu': ReLU(), ...}
    module_dict = dict(model.named_modules())

    for node in traced.graph.nodes:
        if node.op in ("placeholder", "output"):
            continue

        shape = None
        if "tensor_meta" in node.meta:
            shape = list(node.meta["tensor_meta"].shape)

        # Calculate Parameters
        param_count = 0
        if node.op == "call_module":
            submodule = module_dict.get(node.target)
            if submodule:
                param_count = sum(p.numel() for p in submodule.parameters())

        nodes.append({
            "id": node.name,
            "type": node.op, # call_module, call_function, etc.
            "layer": str(node.target), # fc1, relu
            "class_name": module_dict.get(node.target).__class__.__name__ if node.op == "call_module" else "Op",
            "shape": shape,
            "params": param_count
        })

        for user in node.users:
            if user.op not in ("placeholder", "output"):
                edges.append({
                    "from": node.name,
                    "to": user.name
                })

    return {"nodes": nodes, "edges": edges}

class OptimizerRequest(BaseModel):
    optimizer_name: str  # "SGD", "Adam", "RMSprop"
    learning_rate: float
    steps: int
    start_x: float
    start_y: float

# The "Loss Function" Surface (A visual function with hills/valleys)
# f(x, y) = 0.1(x^2 + y^2) - 0.5*cos(3x) - 0.5*cos(3y) (A simplified Rastrigin function)
def surface_function(x, y):
    return 0.1 * (x**2 + y**2) - 0.5 * torch.cos(3*x) - 0.5 * torch.cos(3*y)

@app.post("/optimize")
def run_optimizer(req: OptimizerRequest):
    # 1. Initialize Parameters
    # We use requires_grad=True so PyTorch tracks gradients
    params = torch.tensor([req.start_x, req.start_y], requires_grad=True)
    
    # 2. Select Optimizer
    if req.optimizer_name == "Adam":
        optim = torch.optim.Adam([params], lr=req.learning_rate)
    elif req.optimizer_name == "RMSprop":
        optim = torch.optim.RMSprop([params], lr=req.learning_rate)
    else:
        optim = torch.optim.SGD([params], lr=req.learning_rate, momentum=0.9)
        
    path = []
    losses = []

    # 3. Training Loop
    for step in range(req.steps):
        # Record current position
        x_val = params[0].item()
        y_val = params[1].item()
        
        # Calculate Loss (Z-height)
        loss = surface_function(params[0], params[1])
        
        path.append([x_val, loss.item(), y_val]) # Store as [x, z, y] for 3D plotting
        losses.append(loss.item())

        # Optimization Step
        optim.zero_grad()
        loss.backward()
        optim.step()

    return {"path": path, "losses": losses}