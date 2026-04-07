import React, { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sphere, Html, Text } from "@react-three/drei";
import * as THREE from "three";

// --- MATH & SURFACE LOGIC ---

// Current Function: f(x, y) = 0.1(x^2 + y^2) - 0.5*cos(3x) - 0.5*cos(3y)
// We add a 'seed' to shift the waves, simulating a "random" surface
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
    colorTop: { value: new THREE.Color("#ff0055") },
    colorBottom: { value: new THREE.Color("#007acc") },
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
      // Create contour bands based on height (vZ)
      float bands = sin(vZ * 10.0);
      float thickness = 0.1;
      
      // Mix colors based on height
      vec3 color = mix(vec3(0.0, 0.4, 0.8), vec3(1.0, 0.0, 0.3), (vZ + 2.0) / 6.0);
      
      // Add black contour lines
      if (bands > 0.9) {
        color = vec3(1.0, 1.0, 1.0); // White lines for contrast
      }
      
      gl_FragColor = vec4(color, 0.9);
    }
  `,
};

// 1. The 3D Terrain Component
const LossSurface = ({ seed }) => {
  const meshRef = useRef();

  const geometry = useMemo(() => {
    const size = 10;
    const segments = 128; // Higher res for smooth contours
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
  }, [seed]); // Re-run when seed changes

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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

// 2. The Animated Ball Component
const OptimizerBall = ({ path, isPlaying }) => {
  const sphereRef = useRef();
  // We use a ref for current step to avoid re-renders slowing down the loop
  const stepRef = useRef(0);
  const [displayStep, setDisplayStep] = useState(0); // Only for UI updates

  useFrame((state, delta) => {
    if (!isPlaying || !path || stepRef.current >= path.length - 1) return;

    // Control Speed: Advance 1 step every X seconds?
    // For smoothness, we just move 1 step per few frames or interpolate.
    // Here we do simple interpolation:

    const speed = 5 * delta; // Adjust this multiplier for speed
    const currentIdx = Math.floor(stepRef.current);
    const nextIdx = Math.min(currentIdx + 1, path.length - 1);

    stepRef.current += speed;

    if (currentIdx < path.length - 1) {
      const p1 = path[currentIdx];
      const p2 = path[nextIdx];
      const alpha = stepRef.current - currentIdx; // 0 to 1

      // Interpolate position
      const x = THREE.MathUtils.lerp(p1[0], p2[0], alpha);
      const y = THREE.MathUtils.lerp(p1[1], p2[1], alpha); // Z in data is Y in 3D
      const z = THREE.MathUtils.lerp(p1[2], p2[2], alpha);

      if (sphereRef.current) {
        sphereRef.current.position.set(x, y + 0.2, z); // Lift slightly above surface
      }

      // Sync UI occasionally
      if (Math.floor(stepRef.current) > displayStep) {
        setDisplayStep(Math.floor(stepRef.current));
      }
    }
  });

  // Reset ball when path changes
  useEffect(() => {
    stepRef.current = 0;
    if (path && path[0] && sphereRef.current) {
      sphereRef.current.position.set(path[0][0], path[0][1] + 0.2, path[0][2]);
    }
  }, [path]);

  return (
    <group>
      <Sphere ref={sphereRef} args={[0.15, 32, 32]} position={[0, 5, 0]}>
        <meshStandardMaterial
          color="#fff"
          emissive="#fff"
          emissiveIntensity={1}
        />
      </Sphere>
      {/* Label following the ball */}
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
              background: "rgba(0,0,0,0.7)",
              padding: "2px 5px",
              borderRadius: 4,
              fontSize: 10,
              whiteSpace: "nowrap",
            }}
          >
            Step {displayStep}
          </div>
        </Html>
      )}
    </group>
  );
};

// --- MAIN PAGE COMPONENT ---
export default function OptimizerLab() {
  const [optimizer, setOptimizer] = useState("SGD");
  const [lr, setLr] = useState(0.05);
  const [epochs, setEpochs] = useState(100);
  const [path, setPath] = useState(null);
  const [losses, setLosses] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seed, setSeed] = useState(0); // Surface Randomizer

  // Generate a new random surface
  const randomizeSurface = () => {
    setSeed(Math.random() * 100);
    setPath(null); // Clear previous run
    setLosses([]);
    setIsPlaying(false);
  };

  const runSimulation = async () => {
    // Reset
    setIsPlaying(false);
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
        }),
      });

      const data = await res.json();
      setPath(data.path);
      setLosses(data.losses);

      // Brief delay before starting animation so user sees the "Reset" state
      setTimeout(() => setIsPlaying(true), 100);
    } catch (e) {
      alert("Backend not running?");
    }
  };

  // Normalization for 2D Graph (Scale 0-100)
  const normalizedLossPoints = useMemo(() => {
    if (losses.length === 0) return "";
    const min = Math.min(...losses);
    const max = Math.max(...losses);
    const range = max - min || 1; // Avoid divide by zero

    return losses
      .map((l, i) => {
        const x = (i / (losses.length - 1)) * 100; // X percent
        const y = 100 - ((l - min) / range) * 100; // Y percent (inverted because SVG 0 is top)
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
          background: "#252526",
          padding: "20px",
          borderRight: "1px solid #333",
          color: "white",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ marginTop: 0, color: "#4fc1ff" }}>Optimizer Lab 🧪</h3>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: "#aaa", fontWeight: "bold" }}>
            OPTIMIZER
          </label>
          <select
            value={optimizer}
            onChange={(e) => setOptimizer(e.target.value)}
            style={{
              width: "100%",
              padding: 8,
              marginTop: 5,
              background: "#3c3c3c",
              color: "white",
              border: "1px solid #555",
              borderRadius: 4,
            }}
          >
            <option value="SGD">SGD (Stochastic Gradient Descent)</option>
            <option value="Adam">Adam (Adaptive Momentum)</option>
            <option value="RMSprop">RMSprop</option>
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label style={{ fontSize: 11, color: "#aaa", fontWeight: "bold" }}>
              LEARNING RATE
            </label>
            <span style={{ fontSize: 11, color: "#4fc1ff" }}>{lr}</span>
          </div>
          <input
            type="range"
            min="0.001"
            max="0.5"
            step="0.001"
            value={lr}
            onChange={(e) => setLr(e.target.value)}
            style={{ width: "100%", cursor: "pointer" }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label style={{ fontSize: 11, color: "#aaa", fontWeight: "bold" }}>
              EPOCHS
            </label>
            <span style={{ fontSize: 11, color: "#4fc1ff" }}>{epochs}</span>
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={epochs}
            onChange={(e) => setEpochs(e.target.value)}
            style={{ width: "100%", cursor: "pointer" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button
            onClick={randomizeSurface}
            style={{
              flex: 1,
              padding: "10px",
              background: "#444",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            🎲 Random Surface
          </button>
          <button
            onClick={runSimulation}
            style={{
              flex: 2,
              padding: "10px",
              background: "#0e639c",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: 12,
            }}
          >
            ▶ Run
          </button>
        </div>

        {/* 2D GRAPH */}
        <div
          style={{
            flex: 1,
            border: "1px solid #444",
            background: "#1e1e1e",
            borderRadius: 6,
            padding: 10,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#aaa",
              marginBottom: 10,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>LOSS CURVE</span>
            {losses.length > 0 && (
              <span style={{ color: "#ff0055" }}>
                Final: {losses[losses.length - 1].toFixed(4)}
              </span>
            )}
          </div>

          <div style={{ width: "100%", height: "120px", position: "relative" }}>
            {losses.length > 0 ? (
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Grid Lines */}
                <line
                  x1="0"
                  y1="25"
                  x2="100"
                  y2="25"
                  stroke="#333"
                  strokeWidth="0.5"
                />
                <line
                  x1="0"
                  y1="50"
                  x2="100"
                  y2="50"
                  stroke="#333"
                  strokeWidth="0.5"
                />
                <line
                  x1="0"
                  y1="75"
                  x2="100"
                  y2="75"
                  stroke="#333"
                  strokeWidth="0.5"
                />

                {/* The Data Line */}
                <polyline
                  points={normalizedLossPoints}
                  fill="none"
                  stroke="#ff0055"
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
                  color: "#555",
                  fontSize: 11,
                }}
              >
                Waiting for run...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: 3D */}
      <div style={{ flex: 1, background: "#121212", position: "relative" }}>
        <Canvas camera={{ position: [8, 10, 8], fov: 40 }}>
          <color attach="background" args={["#121212"]} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <OrbitControls autoRotate={false} enableDamping dampingFactor={0.1} />

          {/* The Surface with Contours */}
          <LossSurface seed={seed} />

          {/* The Optimizer Agent */}
          {path && <OptimizerBall path={path} isPlaying={isPlaying} />}

          {/* Helper Grid */}
          <gridHelper
            args={[20, 20, 0x333333, 0x111111]}
            position={[0, -2, 0]}
          />
        </Canvas>

        {/* Legend */}
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            background: "rgba(0,0,0,0.8)",
            padding: "10px 15px",
            borderRadius: 6,
            color: "white",
            fontSize: 11,
            border: "1px solid #333",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                background: "#ff0055",
                borderRadius: "50%",
              }}
            ></div>
            Current Position
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 10,
                height: 10,
                background: "linear-gradient(to right, #007acc, #ff0055)",
                borderRadius: 2,
              }}
            ></div>
            Low Loss → High Loss
          </div>
        </div>
      </div>
    </div>
  );
}
