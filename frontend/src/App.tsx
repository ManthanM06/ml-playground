import React, { useState, useEffect } from "react";
import ModelBuilder from "./ModelBuilder";
import OptimizerLab from "./OptimizerLab";
import MicrogradLab from "./MicrogradLab";

// --- Error Boundary ---
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: string },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 16,
            color: "var(--text-secondary)",
            padding: 40,
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h3 style={{ color: "var(--accent-red)", margin: 0 }}>
            Something went wrong
          </h3>
          <p style={{ fontSize: 13, textAlign: "center", maxWidth: 400, color: "var(--text-muted)" }}>
            {this.state.error}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => this.setState({ hasError: false, error: "" })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Toast System ---
interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
}

let toastId = 0;

export function showToast(
  message: string,
  type: "error" | "success" = "error"
) {
  const event = new CustomEvent("show-toast", {
    detail: { id: ++toastId, message, type },
  });
  window.dispatchEvent(event);
}

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const toast = (e as CustomEvent).detail as Toast;
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3500);
    };
    window.addEventListener("show-toast", handler);
    return () => window.removeEventListener("show-toast", handler);
  }, []);

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === "error" ? "❌ " : "✅ "} {t.message}
        </div>
      ))}
    </div>
  );
}

// --- Tab Config ---
const TABS = [
  { id: "builder", label: "Model Architecture", icon: "🧠" },
  { id: "optimizer", label: "Optimizer Lab", icon: "⚡" },
  { id: "micrograd", label: "Backprop Playground", icon: "🔬" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("builder");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg-primary)",
      }}
    >
      <ToastContainer />

      {/* NAVBAR */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-brand-icon">⚡</div>
          PyTorch Studio
        </div>

        <div className="nav-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ErrorBoundary key={activeTab}>
          {activeTab === "builder" && <ModelBuilder />}
          {activeTab === "optimizer" && <OptimizerLab />}
          {activeTab === "micrograd" && <MicrogradLab />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
