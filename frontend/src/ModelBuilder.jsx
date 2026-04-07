import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import Editor from "@monaco-editor/react";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { toPng } from "html-to-image";
import { showToast } from "./App";

// 3D Imports
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Line,
  RoundedBox,
  Environment,
} from "@react-three/drei";
import * as THREE from "three";

const NODE_WIDTH = 240;
const NODE_HEIGHT = 170;

// --- Extended Color Palette ---
const LAYER_COLORS = {
  Linear: "#6366f1",
  Conv2d: "#10b981",
  Conv1d: "#34d399",
  ReLU: "#f97316",
  GELU: "#fb923c",
  LeakyReLU: "#fdba74",
  MaxPool2d: "#ef4444",
  AvgPool2d: "#f87171",
  AdaptiveAvgPool2d: "#fca5a5",
  Flatten: "#a855f7",
  Dropout: "#64748b",
  BatchNorm2d: "#22d3ee",
  BatchNorm1d: "#67e8f9",
  LayerNorm: "#06b6d4",
  Sigmoid: "#eab308",
  Tanh: "#facc15",
  Softmax: "#84cc16",
  LogSoftmax: "#a3e635",
  Embedding: "#ec4899",
  LSTM: "#f472b6",
  GRU: "#fb7185",
  TransformerEncoder: "#c084fc",
  TransformerDecoder: "#e879f9",
  MultiheadAttention: "#d946ef",
  default: "#64748b",
};

const getLayerColor = (className) =>
  LAYER_COLORS[className] || LAYER_COLORS.default;

// --- 3D Dimension Helpers ---
const SCALE_FACTOR = 0.15;
const MIN_SIZE = 0.3;

function calculate3DDimensions(shape) {
  if (!shape || shape.length < 2) return [1, 0.5, 1];
  const dims = shape.slice(1);
  let w = 1, h = 1, d = 0.5;
  if (dims.length === 3) {
    d = Math.max(dims[0] * SCALE_FACTOR * 0.5, MIN_SIZE);
    h = Math.max(dims[1] * SCALE_FACTOR, MIN_SIZE);
    w = Math.max(dims[2] * SCALE_FACTOR, MIN_SIZE);
  } else if (dims.length === 1) {
    const features = dims[0];
    w = Math.max(Math.log2(features) * SCALE_FACTOR * 1.5, MIN_SIZE * 2);
    h = MIN_SIZE;
    d = MIN_SIZE;
  } else {
    w = Math.max((dims[0] || 1) * SCALE_FACTOR, MIN_SIZE);
  }
  return [w, h, d];
}

// --- 2D Layout Helper ---
function getLayoutedElements(nodes, edges, direction = "TB") {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 150 });
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);
  const layoutedNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      targetPosition: "top",
      sourcePosition: "bottom",
    };
  });
  return { nodes: layoutedNodes, edges };
}

// --- 2D Graph Component ---
const VisualizerGraph = ({ nodes, edges, triggerFit, onNodeClick, graphRef }) => {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (triggerFit && nodes.length > 0) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 800, minZoom: 0.5 });
      });
    }
  }, [triggerFit, nodes, fitView]);

  return (
    <div ref={graphRef} style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.1}
        onNodeClick={(_, node) => onNodeClick?.(node)}
      >
        <Background color="#333" gap={25} />
        <Controls
          style={{
            backgroundColor: "rgba(26, 26, 46, 0.9)",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
      </ReactFlow>
    </div>
  );
};

// --- 3D Components ---
const Layer3D = ({ position, color, label, details, args: boxArgs }) => {
  const boxHeight = boxArgs[1];
  return (
    <group position={position}>
      <RoundedBox args={boxArgs} radius={0.05} smoothness={2}>
        <meshPhysicalMaterial
          color={color}
          transparent
          opacity={0.9}
          metalness={0.1}
          roughness={0.2}
          clearcoat={1}
        />
      </RoundedBox>
      <Text
        position={[0, boxHeight / 2 + 0.5, 0]}
        fontSize={0.35}
        color="white"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#000"
      >
        {label}
      </Text>
      <Text
        position={[0, -boxHeight / 2 - 0.3, 0]}
        fontSize={0.2}
        color="#ccc"
        anchorX="center"
        anchorY="top"
      >
        {details}
      </Text>
    </group>
  );
};

const Connection3D = ({ start, end }) => (
  <Line
    points={[start, end]}
    color="#ffffff"
    lineWidth={1}
    transparent
    opacity={0.3}
    dashed
    dashScale={2}
    gapSize={1}
  />
);

const Visualizer3D = ({ nodes }) => {
  const elementsData = useMemo(() => {
    let currentY = 0;
    const spacing = 1.5;
    return nodes.map((node, i) => {
      const dims = calculate3DDimensions(node.data.outShape);
      const height = dims[1];
      if (i > 0) {
        const prevHeight = calculate3DDimensions(nodes[i - 1].data.outShape)[1];
        currentY -= prevHeight / 2 + spacing + height / 2;
      }
      return { ...node, pos3D: [0, currentY, 0], dims3D: dims };
    });
  }, [nodes]);

  const centerY =
    elementsData.length > 0
      ? elementsData[elementsData.length - 1].pos3D[1] / 2
      : 0;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          zIndex: 10,
          color: "var(--text-muted)",
          fontSize: "11px",
          pointerEvents: "none",
          background: "rgba(10,10,15,0.7)",
          backdropFilter: "blur(10px)",
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div>🖱️ <b>Left Drag:</b> Rotate</div>
        <div>🖱️ <b>Right Drag:</b> Pan</div>
        <div>🖱️ <b>Scroll:</b> Zoom</div>
      </div>
      <Canvas camera={{ position: [8, centerY, 12], fov: 45 }}>
        <color attach="background" args={["#0a0a0f"]} />
        <ambientLight intensity={0.4} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color={getLayerColor("Linear")} />
        <Environment preset="city" />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          rotateSpeed={0.5}
          panSpeed={1}
          screenSpacePanning={true}
          target={[0, centerY, 0]}
        />
        <group position={[0, 2, 0]}>
          {elementsData.map((node, i) => (
            <group key={node.id}>
              <Layer3D
                position={node.pos3D}
                args={node.dims3D}
                color={getLayerColor(node.data.className)}
                label={node.data.layerName}
                details={JSON.stringify(node.data.outShape)}
              />
              {i < elementsData.length - 1 && (
                <Connection3D start={node.pos3D} end={elementsData[i + 1].pos3D} />
              )}
            </group>
          ))}
        </group>
      </Canvas>
    </div>
  );
};

// --- Model Templates ---
const MODEL_TEMPLATES = [
  {
    name: "Simple MLP",
    inputShape: "1, 784",
    code: `import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(784, 256)
        self.relu1 = nn.ReLU()
        self.dropout1 = nn.Dropout(0.2)
        self.fc2 = nn.Linear(256, 128)
        self.relu2 = nn.ReLU()
        self.fc3 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.dropout1(self.relu1(self.fc1(x)))
        x = self.relu2(self.fc2(x))
        x = self.fc3(x)
        return x

model = Model()
`,
  },
  {
    name: "CNN (MNIST)",
    inputShape: "1, 1, 28, 28",
    code: `import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 16, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(16)
        self.relu1 = nn.ReLU()
        self.pool1 = nn.MaxPool2d(2)

        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.MaxPool2d(2)

        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.relu3 = nn.ReLU()
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.pool1(self.relu1(self.bn1(self.conv1(x))))
        x = self.pool2(self.relu2(self.bn2(self.conv2(x))))
        x = self.flatten(x)
        x = self.relu3(self.fc1(x))
        x = self.fc2(x)
        return x

model = Model()
`,
  },
  {
    name: "LeNet-5",
    inputShape: "1, 1, 32, 32",
    code: `import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 6, kernel_size=5)
        self.relu1 = nn.ReLU()
        self.pool1 = nn.AvgPool2d(2)
        self.conv2 = nn.Conv2d(6, 16, kernel_size=5)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.AvgPool2d(2)
        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(16 * 5 * 5, 120)
        self.relu3 = nn.ReLU()
        self.fc2 = nn.Linear(120, 84)
        self.relu4 = nn.ReLU()
        self.fc3 = nn.Linear(84, 10)

    def forward(self, x):
        x = self.pool1(self.relu1(self.conv1(x)))
        x = self.pool2(self.relu2(self.conv2(x)))
        x = self.flatten(x)
        x = self.relu3(self.fc1(x))
        x = self.relu4(self.fc2(x))
        x = self.fc3(x)
        return x

model = Model()
`,
  },
  {
    name: "VGG-style (small)",
    inputShape: "1, 3, 32, 32",
    code: `import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 64, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu1 = nn.ReLU()
        self.conv2 = nn.Conv2d(64, 64, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(64)
        self.relu2 = nn.ReLU()
        self.pool1 = nn.MaxPool2d(2)

        self.conv3 = nn.Conv2d(64, 128, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(128)
        self.relu3 = nn.ReLU()
        self.conv4 = nn.Conv2d(128, 128, 3, padding=1)
        self.bn4 = nn.BatchNorm2d(128)
        self.relu4 = nn.ReLU()
        self.pool2 = nn.MaxPool2d(2)

        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(128 * 8 * 8, 256)
        self.relu5 = nn.ReLU()
        self.dropout = nn.Dropout(0.5)
        self.fc2 = nn.Linear(256, 10)

    def forward(self, x):
        x = self.relu1(self.bn1(self.conv1(x)))
        x = self.pool1(self.relu2(self.bn2(self.conv2(x))))
        x = self.relu3(self.bn3(self.conv3(x)))
        x = self.pool2(self.relu4(self.bn4(self.conv4(x))))
        x = self.flatten(x)
        x = self.dropout(self.relu5(self.fc1(x)))
        x = self.fc2(x)
        return x

model = Model()
`,
  },
  {
    name: "Autoencoder",
    inputShape: "1, 784",
    code: `import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        # Encoder
        self.enc1 = nn.Linear(784, 256)
        self.relu1 = nn.ReLU()
        self.enc2 = nn.Linear(256, 64)
        self.relu2 = nn.ReLU()
        self.enc3 = nn.Linear(64, 16)
        self.relu3 = nn.ReLU()
        # Decoder
        self.dec1 = nn.Linear(16, 64)
        self.relu4 = nn.ReLU()
        self.dec2 = nn.Linear(64, 256)
        self.relu5 = nn.ReLU()
        self.dec3 = nn.Linear(256, 784)
        self.sig = nn.Sigmoid()

    def forward(self, x):
        x = self.relu1(self.enc1(x))
        x = self.relu2(self.enc2(x))
        x = self.relu3(self.enc3(x))
        x = self.relu4(self.dec1(x))
        x = self.relu5(self.dec2(x))
        x = self.sig(self.dec3(x))
        return x

model = Model()
`,
  },
  {
    name: "Deep CNN (CIFAR)",
    inputShape: "1, 3, 32, 32",
    code: `import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 32, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(32)
        self.relu1 = nn.ReLU()
        self.conv2 = nn.Conv2d(32, 32, 3, padding=1)
        self.bn2 = nn.BatchNorm2d(32)
        self.relu2 = nn.ReLU()
        self.pool1 = nn.MaxPool2d(2)
        self.drop1 = nn.Dropout(0.25)

        self.conv3 = nn.Conv2d(32, 64, 3, padding=1)
        self.bn3 = nn.BatchNorm2d(64)
        self.relu3 = nn.ReLU()
        self.conv4 = nn.Conv2d(64, 64, 3, padding=1)
        self.bn4 = nn.BatchNorm2d(64)
        self.relu4 = nn.ReLU()
        self.pool2 = nn.MaxPool2d(2)
        self.drop2 = nn.Dropout(0.25)

        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(64 * 8 * 8, 512)
        self.relu5 = nn.ReLU()
        self.drop3 = nn.Dropout(0.5)
        self.fc2 = nn.Linear(512, 10)

    def forward(self, x):
        x = self.relu1(self.bn1(self.conv1(x)))
        x = self.drop1(self.pool1(self.relu2(self.bn2(self.conv2(x)))))
        x = self.relu3(self.bn3(self.conv3(x)))
        x = self.drop2(self.pool2(self.relu4(self.bn4(self.conv4(x)))))
        x = self.flatten(x)
        x = self.drop3(self.relu5(self.fc1(x)))
        x = self.fc2(x)
        return x

model = Model()
`,
  },
];

const STORAGE_KEY = "pytorch-studio-code";

export default function ModelBuilder() {
  // Load from localStorage
  const savedData = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }, []);

  const [code, setCode] = useState(savedData?.code || MODEL_TEMPLATES[1].code);
  const [inputShape, setInputShape] = useState(savedData?.inputShape || "1, 1, 28, 28");
  const [result, setResult] = useState(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [viewMode, setViewMode] = useState("3D");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const graphRef = useRef(null);

  // Save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, inputShape }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, inputShape]);

  // Model summary stats
  const modelStats = useMemo(() => {
    if (!result) return null;
    const totalParams = result.nodes.reduce((sum, n) => sum + (n.params || 0), 0);
    const layerCount = result.nodes.length;
    const memoryMB = (totalParams * 4 / 1024 / 1024).toFixed(2); // 4 bytes per float32
    return { totalParams, layerCount, memoryMB };
  }, [result]);

  const handleEditorChange = (value) => setCode(value || "");

  // Load template
  const loadTemplate = (templateName) => {
    const template = MODEL_TEMPLATES.find((t) => t.name === templateName);
    if (template) {
      setCode(template.code);
      setInputShape(template.inputShape);
      showToast(`Loaded "${template.name}" template`, "success");
    }
  };

  useEffect(() => {
    if (!result) return;
    const rawNodes = result.nodes.map((node) => {
      const color = getLayerColor(node.class_name);
      return {
        id: node.id,
        data: {
          className: node.class_name,
          layerName: node.layer,
          outShape: node.shape,
          params: node.params,
          label: (
            <div style={{ cursor: "pointer" }}>
              <div
                style={{
                  fontWeight: 700,
                  color,
                  fontSize: "14px",
                  marginBottom: "4px",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {node.layer}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "8px", fontFamily: "var(--font-sans)" }}>
                {node.class_name}
              </div>
              <div
                style={{
                  background: "rgba(99, 102, 241, 0.1)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  display: "inline-block",
                  marginBottom: "8px",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                  {node.params.toLocaleString()} params
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  background: "rgba(0,0,0,0.3)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                }}
              >
                {JSON.stringify(node.shape)}
              </div>
            </div>
          ),
        },
        style: {
          borderTop: `3px solid ${color}`,
          borderRadius: 10,
          padding: 16,
          background: "rgba(18, 18, 26, 0.95)",
          backdropFilter: "blur(10px)",
          color: "#fff",
          width: NODE_WIDTH,
          boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)`,
          border: "1px solid rgba(255,255,255,0.06)",
          transition: "box-shadow 0.2s ease",
        },
      };
    });

    const rawEdges = result.edges.map((edge, i) => ({
      id: `e-${i}`,
      source: edge.from,
      target: edge.to,
      animated: true,
      style: { stroke: "#6366f1", strokeWidth: 2, opacity: 0.7 },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges, "TB");
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [result]);

  const run = async () => {
    setIsLoading(true);
    setSelectedNode(null);
    try {
      const shapeArray = inputShape
        .replace(/[()]/g, "")
        .split(",")
        .map((num) => parseInt(num.trim()));
      const res = await fetch("http://127.0.0.1:8000/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input_shape: shapeArray }),
      });
      const data = await res.json();
      if (data.error) {
        showToast(data.error, "error");
      } else {
        setResult(data);
        setFitTrigger((v) => v + 1);
        showToast(`Model traced: ${data.nodes.length} layers`, "success");
      }
    } catch (e) {
      showToast("Failed to connect to backend. Is it running?", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Export PNG
  const exportPNG = useCallback(async () => {
    if (!graphRef.current) return;
    try {
      const dataUrl = await toPng(graphRef.current, {
        backgroundColor: "#0a0a0f",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = "model-architecture.png";
      link.href = dataUrl;
      link.click();
      showToast("PNG exported successfully!", "success");
    } catch {
      showToast("Failed to export PNG", "error");
    }
  }, []);

  // Node click handler
  const handleNodeClick = (node) => {
    setSelectedNode(
      selectedNode?.id === node.id ? null : node
    );
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        width: "100%",
        background: "var(--bg-primary)",
      }}
    >
      {/* LEFT PANEL */}
      <div
        style={{
          width: "38%",
          minWidth: "340px",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border-primary)",
          background: "var(--bg-secondary)",
        }}
      >
        {/* Controls Bar */}
        <div
          style={{
            padding: "14px 16px",
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
            borderBottom: "1px solid var(--border-primary)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <label className="label">INPUT SHAPE</label>
            <input
              className="input"
              value={inputShape}
              onChange={(e) => setInputShape(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={run} disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></span>
                Tracing...
              </>
            ) : (
              "Visualize ▶"
            )}
          </button>
        </div>

        {/* Template Bar */}
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(255,255,255,0.01)",
          }}
        >
          <label className="label" style={{ marginBottom: 0, whiteSpace: "nowrap" }}>
            TEMPLATE
          </label>
          <select
            className="select"
            onChange={(e) => loadTemplate(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              Load a model template...
            </option>
            {MODEL_TEMPLATES.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Editor */}
        <div style={{ flex: 1 }}>
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 15 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              renderLineHighlight: "gutter",
            }}
          />
        </div>

        {/* Auto-save indicator */}
        <div
          style={{
            padding: "6px 16px",
            fontSize: "11px",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border-primary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>💾 Auto-saved to browser</span>
          <button
            className="btn-ghost"
            style={{ fontSize: 11, padding: "4px 8px" }}
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setCode(MODEL_TEMPLATES[1].code);
              setInputShape("1, 1, 28, 28");
              showToast("Reset to default", "success");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-primary)",
          position: "relative",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            height: "50px",
            borderBottom: "1px solid var(--border-primary)",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 14 }}>
            Model Graph
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {viewMode === "2D" && result && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={exportPNG}
              >
                📷 Export PNG
              </button>
            )}
            <div className="nav-tabs" style={{ padding: 3 }}>
              {["2D Graph", "3D Model"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode.split(" ")[0])}
                  className={`nav-tab ${viewMode === mode.split(" ")[0] ? "active" : ""}`}
                  style={{ fontSize: 12, padding: "6px 14px" }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        {modelStats && (
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-label">Layers:</span>
              <span className="stat-value">{modelStats.layerCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Parameters:</span>
              <span className="stat-value">{modelStats.totalParams.toLocaleString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Memory:</span>
              <span className="stat-value">{modelStats.memoryMB} MB</span>
            </div>
          </div>
        )}

        {/* Graph */}
        <div style={{ flex: 1, position: "relative" }}>
          {isLoading && (
            <div className="loading-overlay">
              <span className="spinner spinner-lg"></span>
              <span>Tracing model architecture...</span>
            </div>
          )}
          {viewMode === "2D" ? (
            <ReactFlowProvider>
              <VisualizerGraph
                nodes={nodes}
                edges={edges}
                triggerFit={fitTrigger}
                onNodeClick={handleNodeClick}
                graphRef={graphRef}
              />
            </ReactFlowProvider>
          ) : (
            <Visualizer3D nodes={nodes} />
          )}

          {/* Node Detail Popup */}
          {selectedNode && viewMode === "2D" && (
            <div
              className="detail-popup"
              style={{ top: 20, right: 20 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: 0 }}>{selectedNode.data.layerName}</h4>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 16,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="detail-popup-row">
                  <span className="label">Type</span>
                  <span className="value">{selectedNode.data.className}</span>
                </div>
                <div className="detail-popup-row">
                  <span className="label">Output Shape</span>
                  <span className="value">{JSON.stringify(selectedNode.data.outShape)}</span>
                </div>
                <div className="detail-popup-row">
                  <span className="label">Parameters</span>
                  <span className="value">{selectedNode.data.params?.toLocaleString()}</span>
                </div>
                {selectedNode.data.outShape && (
                  <div className="detail-popup-row">
                    <span className="label">Output Elements</span>
                    <span className="value">
                      {selectedNode.data.outShape.reduce((a, b) => a * b, 1).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
