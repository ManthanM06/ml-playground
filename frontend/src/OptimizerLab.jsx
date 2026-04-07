import React, { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
import { showToast } from "./App";

// --- MATH & SURFACE LOGIC ---
const calculateSurfaceZ = (x, y, seed = 0) => {
  return (
    0.1 * (x ** 2 + y ** 2) -
    0.5 * Math.cos(3 * x + seed) -
    0.5 * Math.cos(3 * y + seed)
  );
};

// Custom Shader for Contour Lines
const ContourMaterial = {
  uniforms: {
    colorTop: { value: new THREE.Color("#ec4899") },
    colorBottom: { value: new THREE.Color("#6366f1") },
  },
  vertexShader: `
    varying float vZ;
    void main() {
      vZ = position.z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vZ;
    void main() {
      float bands = sin(vZ * 10.0);
      float thickness = 0.1;
      vec3 color = mix(vec3(0.388, 0.4, 0.945), vec3(0.925, 0.282, 0.6), (vZ + 2.0) / 6.0);
      if (bands > 0.9) {
        color = vec3(1.0, 1.0, 1.0);
      }
      gl_FragColor = vec4(color, 0.9);
    }
  `,
};

// The 3D Terrain
const LossSurface = ({ seed }) => {
  const geometry = useMemo(() => {
    const size = 10;
    const segments = 128;
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = calculateSurfaceZ(x, -y, seed);
      pos.setZ(i, z);
    }
    geom.computeVertexNormals();
    return geom;
  }, [seed]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <primitive object={geometry} attach="geometry" />
      <shaderMaterial
        args={[ContourMaterial]}
        side={THREE.DoubleSide}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
};

// The Animated Ball
const OptimizerBall = ({ path, isPlaying }) => {
  const sphereRef = useRef();
  const stepRef = useRef(0);
  const [displayStep, setDisplayStep] = useState(0);

  useFrame((state, delta) => {
    if (!isPlaying || !path || stepRef.current >= path.length - 1) return;
    const speed = 5 * delta;
    const currentIdx = Math.floor(stepRef.current);
    const nextIdx = Math.min(currentIdx + 1, path.length - 1);
    stepRef.current += speed;

    if (currentIdx < path.length - 1) {
      const p1 = path[currentIdx];
      const p2 = path[nextIdx];
      const alpha = stepRef.current - currentIdx;
      const x = THREE.MathUtils.lerp(p1[0], p2[0], alpha);
      const y = THREE.MathUtils.lerp(p1[1], p2[1], alpha);
      const z = THREE.MathUtils.lerp(p1[2], p2[2], alpha);
      if (sphereRef.current) {
        sphereRef.current.position.set(x, y + 0.2, z);
      }
      if (Math.floor(stepRef.current) > displayStep) {
        setDisplayStep(Math.floor(stepRef.current));
      }
    }
  });

  useEffect(() => {
    stepRef.current = 0;
    if (path && path[0] && sphereRef.current) {
      sphereRef.current.position.set(path[0][0], path[0][1] + 0.2, path[0][2]);
    }
  }, [path]);

  return (
    <group>
      <Sphere ref={sphereRef} args={[0.15, 32, 32]} position={[0, 5, 0]}>
        <meshStandardMaterial color="#fff" emissive="#6366f1" emissiveIntensity={2} />
      </Sphere>
      {sphereRef.current && (
        <Html
          position={[
            sphereRef.current.position.x,
            sphereRef.current.position.y + 0.5,
            sphereRef.current.position.z,
          ]}
        >
          <div
            style={{
              color: "white",
              background: "rgba(10,10,15,0.85)",
              backdropFilter: "blur(10px)",
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 10,
              whiteSpace: "nowrap",
              border: "1px solid rgba(99,102,241,0.3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Step {displayStep}
          </div>
        </Html>
      )}
    </group>
  );
};

// --- Path Trail ---
const PathTrail = ({ path }) => {
  if (!path || path.length < 2) return null;
  const points = path.map((p) => new THREE.Vector3(p[0], p[1] + 0.15, p[2]));
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial color="#6366f1" transparent opacity={0.5} />
    </line>
  );
};

// --- MAIN ---
export default function OptimizerLab() {
  const [optimizer, setOptimizer] = useState("SGD");
  const [lr, setLr] = useState(0.05);
  const [epochs, setEpochs] = useState(100);
  const [path, setPath] = useState(null);
  const [losses, setLosses] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [seed, setSeed] = useState(0);

  const randomizeSurface = () => {
    setSeed(Math.random() * 100);
    setPath(null);
    setLosses([]);
    setIsPlaying(false);
  };

  const runSimulation = async () => {
    setIsPlaying(false);
    setIsLoading(true);
    setPath(null);
    setLosses([]);

    const startX = (Math.random() - 0.5) * 6;
    const startY = (Math.random() - 0.5) * 6;

    try {
      const res = await fetch("http://127.0.0.1:8000/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optimizer_name: optimizer,
          learning_rate: parseFloat(lr),
          steps: parseInt(epochs),
          start_x: startX,
          start_y: startY,
          seed: seed,
        }),
      });
      const data = await res.json();
      setPath(data.path);
      setLosses(data.losses);
      setTimeout(() => setIsPlaying(true), 100);
      showToast(`${optimizer} optimization complete — ${epochs} steps`, "success");
    } catch (e) {
      showToast("Backend not running?", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Loss curve points
  const normalizedLossPoints = useMemo(() => {
    if (losses.length === 0) return "";
    const min = Math.min(...losses);
    const max = Math.max(...losses);
    const range = max - min || 1;
    return losses
      .map((l, i) => {
        const x = (i / (losses.length - 1)) * 100;
        const y = 100 - ((l - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, [losses]);

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
          gap: "4px",
        }}
      >
        <h3
          style={{
            marginTop: 0,
            marginBottom: 16,
            background: "var(--gradient-accent)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          Optimizer Lab ⚡
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label className="label">OPTIMIZER</label>
          <select
            className="select"
            value={optimizer}
            onChange={(e) => setOptimizer(e.target.value)}
          >
            <option value="SGD">SGD (Stochastic Gradient Descent)</option>
            <option value="Adam">Adam (Adaptive Momentum)</option>
            <option value="RMSprop">RMSprop</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label className="label">LEARNING RATE</label>
            <span 
              style={{ 
                fontSize: 11, 
                color: "var(--accent-cyan)", 
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
              }}
            >
              {lr}
            </span>
          </div>
          <input
            type="range"
            min="0.001"
            max="0.5"
            step="0.001"
            value={lr}
            onChange={(e) => setLr(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label className="label">EPOCHS</label>
            <span
              style={{
                fontSize: 11,
                color: "var(--accent-cyan)",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
              }}
            >
              {epochs}
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={epochs}
            onChange={(e) => setEpochs(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={randomizeSurface}>
            🎲 Surface
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={runSimulation}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Running...
              </>
            ) : (
              "▶ Run Simulation"
            )}
          </button>
        </div>

        {/* Loss Curve */}
        <div
          style={{
            flex: 1,
            border: "1px solid var(--border-primary)",
            background: "var(--bg-primary)",
            borderRadius: "var(--radius-md)",
            padding: 12,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            <span>LOSS CURVE</span>
            {losses.length > 0 && (
              <span style={{ color: "var(--accent-pink)", fontFamily: "var(--font-mono)" }}>
                Final: {losses[losses.length - 1].toFixed(4)}
              </span>
            )}
          </div>

          <div style={{ width: "100%", height: "120px", position: "relative" }}>
            {losses.length > 0 ? (
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lossGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                <polyline
                  points={normalizedLossPoints}
                  fill="none"
                  stroke="url(#lossGrad)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <div
                style={{
                  display: "flex",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  fontSize: 11,
                }}
              >
                Click "Run Simulation" to begin...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: 3D */}
      <div style={{ flex: 1, background: "var(--bg-primary)", position: "relative" }}>
        {isLoading && (
          <div className="loading-overlay">
            <span className="spinner spinner-lg"></span>
            <span>Running {optimizer} optimization...</span>
          </div>
        )}
        <Canvas camera={{ position: [8, 10, 8], fov: 40 }}>
          <color attach="background" args={["#0a0a0f"]} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <OrbitControls autoRotate={false} enableDamping dampingFactor={0.1} />
          <LossSurface seed={seed} />
          {path && <PathTrail path={path} />}
          {path && <OptimizerBall path={path} isPlaying={isPlaying} />}
          <gridHelper args={[20, 20, 0x222222, 0x111111]} position={[0, -2, 0]} />
        </Canvas>

        {/* Legend */}
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            background: "rgba(10,10,15,0.85)",
            backdropFilter: "blur(10px)",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            color: "white",
            fontSize: 11,
            border: "1px solid var(--border-primary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div
              style={{
                width: 10,
                height: 10,
                background: "#6366f1",
                borderRadius: "50%",
                boxShadow: "0 0 8px rgba(99,102,241,0.6)",
              }}
            />
            Optimizer Position
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                background: "linear-gradient(to right, #6366f1, #ec4899)",
                borderRadius: 2,
              }}
            />
            Low → High Loss
          </div>
        </div>
      </div>
    </div>
  );
}
