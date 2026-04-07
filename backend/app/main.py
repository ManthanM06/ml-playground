from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import torch
import torch.nn as nn
import torch.fx as fx
from torch.fx.passes.shape_prop import ShapeProp
import math

app = FastAPI(title="PyTorch Studio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TraceRequest(BaseModel):
    code: str = Field(..., max_length=10000)
    input_shape: list[int] = Field(..., min_length=1, max_length=6)

@app.post("/trace")
def trace_model(req: TraceRequest):
    # Validate shape dimensions
    for dim in req.input_shape:
        if dim < 1 or dim > 2048:
            return {"error": f"Shape dimension {dim} is out of range (1-2048)"}

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
    module_dict = dict(model.named_modules())

    for node in traced.graph.nodes:
        if node.op in ("placeholder", "output"):
            continue

        shape = None
        if "tensor_meta" in node.meta:
            shape = list(node.meta["tensor_meta"].shape)

        param_count = 0
        if node.op == "call_module":
            submodule = module_dict.get(node.target)
            if submodule:
                param_count = sum(p.numel() for p in submodule.parameters())

        nodes.append({
            "id": node.name,
            "type": node.op,
            "layer": str(node.target),
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
    optimizer_name: str = Field(..., pattern="^(SGD|Adam|RMSprop)$")
    learning_rate: float = Field(..., gt=0, le=1.0)
    steps: int = Field(..., ge=1, le=500)
    start_x: float = Field(..., ge=-10.0, le=10.0)
    start_y: float = Field(..., ge=-10.0, le=10.0)
    seed: float = Field(default=0.0)


def surface_function(x, y, seed=0.0):
    """Rastrigin-like loss surface with configurable seed for wave shift."""
    return 0.1 * (x**2 + y**2) - 0.5 * torch.cos(3*x + seed) - 0.5 * torch.cos(3*y + seed)


@app.post("/optimize")
def run_optimizer(req: OptimizerRequest):
    params = torch.tensor([req.start_x, req.start_y], requires_grad=True)

    if req.optimizer_name == "Adam":
        optim = torch.optim.Adam([params], lr=req.learning_rate)
    elif req.optimizer_name == "RMSprop":
        optim = torch.optim.RMSprop([params], lr=req.learning_rate)
    else:
        optim = torch.optim.SGD([params], lr=req.learning_rate, momentum=0.9)

    path = []
    losses = []

    for step in range(req.steps):
        x_val = params[0].item()
        y_val = params[1].item()
        loss = surface_function(params[0], params[1], seed=req.seed)
        path.append([x_val, loss.item(), y_val])
        losses.append(loss.item())

        optim.zero_grad()
        loss.backward()
        optim.step()

    return {"path": path, "losses": losses}