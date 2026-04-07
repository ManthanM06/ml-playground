import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { Value, PRESETS, resetIdCounter } from "./MicrogradEngine";

// --- COLORS ---
const NODE_COLORS = {
  input: "#6366f1",
  weight: "#ec4899",
  op: "#22d3ee",
  output: "#10b981",
  target: "#f97316",
};

function getNodeType(node, graphData) {
  if (node.id === graphData.output.id) return "output";
  if (graphData.inputs && Object.values(graphData.inputs).some((v) => v.id === node.id)) return "input";
  if (graphData.weights && Object.values(graphData.weights).some((v) => v.id === node.id)) return "weight";
  if (graphData.targets && Object.values(graphData.targets).some((v) => v.id === node.id)) return "target";
  return "op";
}

// --- DAGRE LAYOUT ---
const NODE_W = 200;
const NODE_H = 110;

function layoutGraph(rfNodes, rfEdges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 120 });
  rfNodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  rfEdges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return rfNodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

// --- Value Node Renderer ---
function ValueNode({ data }) {
  const accentColor = data.accentColor || "#6366f1";
  const showGrad = data.showGrad;
  const isAnimating = data.isAnimating;

  return (
    <div
      style={{
        background: "rgba(18, 18, 26, 0.95)",
        backdropFilter: "blur(10px)",
        border: `1px solid ${accentColor}40`,
        borderTop: `3px solid ${accentColor}`,
        borderRadius: 10,
        padding: "12px 16px",
        minWidth: 160,
        color: "white",
        boxShadow: isAnimating
          ? `0 0 24px ${accentColor}60, 0 4px 16px rgba(0,0,0,0.4)`
          : `0 4px 16px rgba(0,0,0,0.3)`,
        transition: "box-shadow 0.5s ease",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: accentColor,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {data.label}
        {data.op && (
          <span
            style={{
              fontSize: 10,
              background: `${accentColor}20`,
              padding: "2px 6px",
              borderRadius: 4,
              color: `${accentColor}cc`,
              fontWeight: 500,
            }}
          >
            {data.op}
          </span>
        )}
      </div>

      {/* Value */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>value</div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {data.value.toFixed(4)}
          </div>
        </div>

        {/* Gradient */}
        {showGrad && (
          <div
            style={{
              opacity: showGrad ? 1 : 0,
              transition: "opacity 0.5s ease",
            }}
          >
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>grad</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 15,
                fontWeight: 600,
                color:
                  data.grad > 0
                    ? "#10b981"
                    : data.grad < 0
                    ? "#ef4444"
                    : "var(--text-muted)",
              }}
            >
              {data.grad.toFixed(4)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { valueNode: ValueNode };

// --- Auto-fit component ---
function AutoFit({ trigger, nodeCount }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (nodeCount > 0) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.3, duration: 800 });
      });
    }
  }, [trigger, nodeCount, fitView]);
  return null;
}

// --- MAIN COMPONENT ---
export default function MicrogradLab() {
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [showGrad, setShowGrad] = useState(false);
  const [animatingNodes, setAnimatingNodes] = useState(new Set());
  const [fitTrigger, setFitTrigger] = useState(0);
  const [sliderValues, setSliderValues] = useState({});
  const [graphData, setGraphData] = useState(null);

  // Build graph from preset
  const buildGraph = useCallback((presetIndex, overrides = {}) => {
    const preset = PRESETS[presetIndex];
    const result = preset.build();

    // Apply overrides
    if (overrides) {
      for (const [key, val] of Object.entries(overrides)) {
        if (result.inputs && result.inputs[key]) result.inputs[key].data = val;
        if (result.weights && result.weights[key]) result.weights[key].data = val;
      }
    }

    // Rebuild computation (need to re-run preset with overrides)
    // Actually we need to rebuild the graph entirely
    resetIdCounter();
    const rebuilt = preset.build();
    if (overrides) {
      // We can't easily override after build since the graph is computed.
      // Instead, modify the Value objects before they're used.
      // For now, just use the initial build.
    }

    setGraphData(rebuilt);
    setShowGrad(false);
    setAnimatingNodes(new Set());
    setFitTrigger((v) => v + 1);
  }, []);

  // Initialize
  useEffect(() => {
    buildGraph(selectedPreset);
  }, [selectedPreset]);

  // Convert graph to ReactFlow format
  const { rfNodes, rfEdges } = useMemo(() => {
    if (!graphData) return { rfNodes: [], rfEdges: [] };

    const { nodes: gNodes, edges: gEdges } = graphData.output.getGraph();

    const rawNodes = gNodes.map((node) => {
      const type = getNodeType(node, graphData);
      return {
        id: String(node.id),
        type: "valueNode",
        data: {
          label: node.label || `v${node.id}`,
          value: node.data,
          grad: node.grad,
          op: node._op || null,
          accentColor: NODE_COLORS[type],
          showGrad: showGrad,
          isAnimating: animatingNodes.has(node.id),
        },
        position: { x: 0, y: 0 },
      };
    });

    const rawEdges = gEdges.map((e, i) => ({
      id: `e-${i}`,
      source: String(e.from.id),
      target: String(e.to.id),
      animated: showGrad,
      style: {
        stroke: showGrad ? "#ec4899" : "#6366f180",
        strokeWidth: showGrad ? 2.5 : 1.5,
        transition: "stroke 0.5s ease, stroke-width 0.5s ease",
      },
    }));

    const laid = layoutGraph(rawNodes, rawEdges);
    return { rfNodes: laid, rfEdges: rawEdges };
  }, [graphData, showGrad, animatingNodes]);

  // Forward pass (just shows values — they're already computed)
  const runForward = () => {
    setShowGrad(false);
    setAnimatingNodes(new Set());
    buildGraph(selectedPreset);
  };

  // Backward pass
  const runBackward = () => {
    if (!graphData) return;
    graphData.output.backward();

    // Animate nodes cascading
    const { nodes: gNodes } = graphData.output.getGraph();
    const allIds = gNodes.map((n) => n.id);

    // Animate one by one with delay
    let delay = 0;
    const topo = [...allIds].reverse(); // output first in backward
    const animSet = new Set();
    topo.forEach((id, i) => {
      setTimeout(() => {
        animSet.add(id);
        setAnimatingNodes(new Set(animSet));
      }, i * 120);
    });

    setTimeout(() => {
      setShowGrad(true);
      setAnimatingNodes(new Set());
    }, topo.length * 120 + 200);
  };

  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      {/* LEFT PANEL */}
      <div
        style={{
          width: "320px",
          background: "var(--bg-secondary)",
          padding: "20px",
          borderRight: "1px solid var(--border-primary)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: 4,
            background: "var(--gradient-warm)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          Backprop Playground 🔬
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
          Inspired by Andrej Karpathy's{" "}
          <a
            href="https://github.com/karpathy/micrograd"
            target="_blank"
            rel="noopener"
            style={{ color: "var(--accent-blue-light)" }}
          >
            micrograd
          </a>
          . Visualize how gradients flow backwards through a computation graph.
        </p>

        {/* Preset Selector */}
        <div style={{ marginBottom: 16 }}>
          <label className="label">PRESET</label>
          <select
            className="select"
            value={selectedPreset}
            onChange={(e) => {
              setSelectedPreset(Number(e.target.value));
            }}
          >
            {PRESETS.map((p, i) => (
              <option key={i} value={i}>
                {p.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            {PRESETS[selectedPreset].description}
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={runForward}>
            ▶ Forward
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={runBackward}>
            ◀ Backward
          </button>
        </div>

        {/* Legend */}
        <div
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            NODE LEGEND
          </div>
          {[
            { color: NODE_COLORS.input, label: "Input" },
            { color: NODE_COLORS.weight, label: "Weight / Bias" },
            { color: NODE_COLORS.op, label: "Operation" },
            { color: NODE_COLORS.output, label: "Output" },
            { color: NODE_COLORS.target, label: "Target" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Explanation */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-primary)",
            border: "1px solid var(--border-primary)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            overflow: "auto",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            HOW IT WORKS
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px" }}>
              <strong style={{ color: "var(--accent-blue-light)" }}>Forward Pass:</strong> Data flows left → right.
              Each operation computes its output value from its inputs.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong style={{ color: "var(--accent-pink)" }}>Backward Pass:</strong> Gradients flow right → left.
              Each node calculates how much it contributed to the output using the chain rule.
            </p>
            <p style={{ margin: 0 }}>
              <strong style={{ color: "var(--accent-green)" }}>Gradient meaning:</strong> A large positive gradient means increasing 
              that value will increase the output. Negative means the opposite.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Graph */}
      <div style={{ flex: 1, background: "var(--bg-primary)", position: "relative" }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#222" gap={30} />
            <Controls
              style={{
                backgroundColor: "rgba(26, 26, 46, 0.9)",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
            <AutoFit trigger={fitTrigger} nodeCount={rfNodes.length} />
          </ReactFlow>
        </ReactFlowProvider>

        {/* Status indicator */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: showGrad
              ? "rgba(236, 72, 153, 0.15)"
              : "rgba(99, 102, 241, 0.15)",
            border: `1px solid ${showGrad ? "rgba(236,72,153,0.3)" : "rgba(99,102,241,0.3)"}`,
            padding: "8px 20px",
            borderRadius: "var(--radius-xl)",
            fontSize: 12,
            fontWeight: 600,
            color: showGrad ? "#f9a8d4" : "#a5b4fc",
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
          }}
        >
          {showGrad ? "◀ Backward Pass — Gradients Visible" : "▶ Forward Pass — Values Computed"}
        </div>
      </div>
    </div>
  );
}
