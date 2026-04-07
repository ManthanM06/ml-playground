import React, { useState } from "react";
import ModelBuilder from "./ModelBuilder"; // Your old App.jsx code
import OptimizerLab from "./OptimizerLab"; // The new 3D lab

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
      }}
    >
      {/* TOP NAVIGATION BAR */}
      <div
        style={{
          height: "50px",
          background: "#1e1e1e",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
        }}
      >
        <h3 style={{ color: "#fff", margin: 0, marginRight: 40 }}>
          PyTorch Studio 🚀
        </h3>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setActiveTab("builder")}
            style={{
              background: activeTab === "builder" ? "#333" : "transparent",
              color: activeTab === "builder" ? "#fff" : "#888",
              border: "none",
              padding: "8px 16px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            1. Model Architecture
          </button>
          <button
            onClick={() => setActiveTab("optimizer")}
            style={{
              background: activeTab === "optimizer" ? "#333" : "transparent",
              color: activeTab === "optimizer" ? "#fff" : "#888",
              border: "none",
              padding: "8px 16px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            2. Optimizer Lab
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "builder" ? <ModelBuilder /> : <OptimizerLab />}
      </div>
    </div>
  );
}
