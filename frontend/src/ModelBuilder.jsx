import { useState, useMemo, useEffect, useRef } from "react";
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

// 3D Imports
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  Line,
  RoundedBox,
  Environment,
  Html,
} from "@react-three/drei";
import * as THREE from "three";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 160;

// 🎨 Color Palette
const LAYER_COLORS = {
  Linear: "#3b82f6", // Blue
  Conv2d: "#10b981", // Green
  ReLU: "#f97316", // Orange
  MaxPool2d: "#ef4444", // Red
  Flatten: "#8b5cf6", // Purple
  Dropout: "#64748b", // Grey
  default: "#64748b",
};

const getLayerColor = (className) =>
  LAYER_COLORS[className] || LAYER_COLORS.default;

// --- Helper: Calculate 3D Dimensions ---
const SCALE_FACTOR = 0.15;
const MIN_SIZE = 0.3;

function calculate3DDimensions(shape) {
  if (!shape || shape.length < 2) return [1, 0.5, 1];
  const dims = shape.slice(1);
  let w = 1,
    h = 1,
    d = 0.5;

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
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
      targetPosition: "top",
      sourcePosition: "bottom",
    };
  });

  return { nodes: layoutedNodes, edges };
}

// --- 2D Component ---
const VisualizerGraph = ({ nodes, edges, triggerFit }) => {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (triggerFit && nodes.length > 0) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 800, minZoom: 0.5 });
      });
    }
  }, [triggerFit, nodes, fitView]);

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.1}>
      <Background color="#444" gap={25} />
      <Controls
        style={{ backgroundColor: "#fff", padding: "4px", borderRadius: "4px" }}
      />
    </ReactFlow>
  );
};

// --- 3D Components ---
const Layer3D = ({ position, color, label, details, args }) => {
  const meshRef = useRef();
  const boxHeight = args[1];

  return (
    <group position={position}>
      <RoundedBox ref={meshRef} args={args} radius={0.05} smoothness={2}>
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

const Connection3D = ({ start, end }) => {
  return (
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
};

// 🎮 Updated 3D Visualizer with Better Controls
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
      {/* Control Instructions Overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          zIndex: 10,
          color: "rgba(255,255,255,0.6)",
          fontSize: "12px",
          pointerEvents: "none",
          background: "rgba(0,0,0,0.5)",
          padding: "10px",
          borderRadius: "8px",
        }}
      >
        <div>
          🖱️ <b>Left Click + Drag:</b> Rotate
        </div>
        <div>
          🖱️ <b>Right Click + Drag:</b> Move Up/Down
        </div>
        <div>
          🖱️ <b>Scroll:</b> Zoom
        </div>
      </div>

      <Canvas camera={{ position: [8, centerY, 12], fov: 45 }}>
        <color attach="background" args={["#121212"]} />
        <ambientLight intensity={0.4} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.15}
          penumbra={1}
          intensity={1}
          castShadow
        />
        <pointLight
          position={[-10, -10, -10]}
          intensity={0.5}
          color={getLayerColor("Linear")}
        />
        <Environment preset="city" />

        {/* 🚀 KEY FIX: Controls Configuration 
                   screenSpacePanning: Ensures up/down mouse movement moves camera up/down
                   target: Focuses roughly on the middle of the stack
                */}
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
                <Connection3D
                  start={node.pos3D}
                  end={elementsData[i + 1].pos3D}
                />
              )}
            </group>
          ))}
        </group>
      </Canvas>
    </div>
  );
};

const defaultCode = `import torch
import torch.nn as nn

# A simple CNN to see shape changes
class Model(nn.Module):
    def __init__(self):
        super().__init__()
        # Input shape: [1, 1, 28, 28]
        self.conv1 = nn.Conv2d(1, 16, kernel_size=3, padding=1) 
        self.relu1 = nn.ReLU()
        self.pool1 = nn.MaxPool2d(2) # Shape becomes [1, 16, 14, 14]
        
        self.conv2 = nn.Conv2d(16, 32, kernel_size=3, padding=1)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.MaxPool2d(2) # Shape becomes [1, 32, 7, 7]
        
        self.flatten = nn.Flatten() # Shape becomes [1, 32*7*7 = 1568]
        self.fc1 = nn.Linear(32 * 7 * 7, 128)
        self.relu3 = nn.ReLU()
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.pool1(self.relu1(self.conv1(x)))
        x = self.pool2(self.relu2(self.conv2(x)))
        x = self.flatten(x)
        x = self.relu3(self.fc1(x))
        x = self.fc2(x)
        return x

model = Model()
`;

export default function ModelBuilder() {
  const [code, setCode] = useState(defaultCode);
  const [inputShape, setInputShape] = useState("1, 1, 28, 28");
  const [result, setResult] = useState(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [viewMode, setViewMode] = useState("3D");

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const handleEditorChange = (value) => setCode(value || "");

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
            <div>
              <div
                style={{
                  fontWeight: "bold",
                  color,
                  fontSize: "14px",
                  marginBottom: "4px",
                }}
              >
                {node.layer}
              </div>
              <div
                style={{ fontSize: "12px", opacity: 0.8, marginBottom: "8px" }}
              >
                {node.class_name}
              </div>
              <div
                style={{
                  background: "#333",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  display: "inline-block",
                  marginBottom: "8px",
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: "bold" }}>
                  {node.params.toLocaleString()} params
                </div>
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "11px",
                  background: "rgba(0,0,0,0.2)",
                  padding: "4px",
                }}
              >
                Shape: {JSON.stringify(node.shape)}
              </div>
            </div>
          ),
        },
        style: {
          borderTop: `3px solid ${color}`,
          borderRadius: 8,
          padding: 15,
          background: "#252526",
          color: "#fff",
          width: NODE_WIDTH,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        },
      };
    });

    const rawEdges = result.edges.map((edge, i) => ({
      id: `e-${i}`,
      source: edge.from,
      target: edge.to,
      animated: true,
      style: { stroke: "#4fc1ff", strokeWidth: 2, opacity: 0.8 },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      rawNodes,
      rawEdges,
      "TB"
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [result]);

  const run = async () => {
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
      if (data.error) alert("Error: " + data.error);
      else {
        setResult(data);
        setFitTrigger((v) => v + 1);
      }
    } catch (e) {
      alert("Failed to connect to backend");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: "#1e1e1e",
      }}
    >
      {/* LEFT PANEL */}
      <div
        style={{
          width: "35%",
          minWidth: "300px",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #333",
        }}
      >
        <div
          style={{
            padding: "15px",
            background: "#252526",
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
            borderBottom: "1px solid #333",
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <label
              style={{
                fontSize: "11px",
                color: "#aaa",
                fontWeight: "bold",
                letterSpacing: "0.5px",
              }}
            >
              INPUT SHAPE
            </label>
            <input
              value={inputShape}
              onChange={(e) => setInputShape(e.target.value)}
              style={{
                width: "100%",
                padding: "8px",
                marginTop: "6px",
                background: "#3c3c3c",
                border: "1px solid #444",
                color: "#fff",
                fontFamily: "monospace",
                borderRadius: "4px",
              }}
            />
          </div>
          <button
            onClick={run}
            style={{
              padding: "9px 20px",
              background: "linear-gradient(135deg, #0e639c, #007acc)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              borderRadius: "4px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
            }}
          >
            Visualize ▶
          </button>
        </div>
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
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 15 },
            }}
          />
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          flex: 1,
          height: "100%",
          background: "#121212",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: "50px",
            borderBottom: "1px solid #333",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            justifyContent: "space-between",
            background: "#1e1e1e",
          }}
        >
          <span style={{ fontWeight: "bold", color: "#fff" }}>Model Graph</span>
          <div
            style={{
              display: "flex",
              background: "#111",
              borderRadius: "6px",
              padding: "3px",
              border: "1px solid #333",
            }}
          >
            {["2D Graph", "3D Model"].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode.split(" ")[0])}
                style={{
                  background:
                    viewMode === mode.split(" ")[0] ? "#333" : "transparent",
                  color: viewMode === mode.split(" ")[0] ? "#fff" : "#888",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "12px",
                  transition: "all 0.2s",
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          {viewMode === "2D" ? (
            <ReactFlowProvider>
              <VisualizerGraph
                nodes={nodes}
                edges={edges}
                triggerFit={fitTrigger}
              />
            </ReactFlowProvider>
          ) : (
            <Visualizer3D nodes={nodes} />
          )}
        </div>
      </div>
    </div>
  );
}
