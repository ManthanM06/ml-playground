/**
 * MicrogradEngine.js
 * A JavaScript port of Andrej Karpathy's micrograd engine.
 * Implements a simple autograd engine with a Value class for building
 * computation graphs and automatic backpropagation.
 */

let _globalId = 0;

export class Value {
  constructor(data, _children = [], _op = "", label = "") {
    this.id = _globalId++;
    this.data = typeof data === "number" ? data : parseFloat(data);
    this.grad = 0.0;
    this.label = label;
    this._backward = () => {};
    this._prev = new Set(_children);
    this._op = _op;
  }

  add(other) {
    other = other instanceof Value ? other : new Value(other);
    const out = new Value(this.data + other.data, [this, other], "+");
    out._backward = () => {
      this.grad += out.grad;
      other.grad += out.grad;
    };
    return out;
  }

  mul(other) {
    other = other instanceof Value ? other : new Value(other);
    const out = new Value(this.data * other.data, [this, other], "*");
    out._backward = () => {
      this.grad += other.data * out.grad;
      other.grad += this.data * out.grad;
    };
    return out;
  }

  pow(other) {
    const out = new Value(Math.pow(this.data, other), [this], `**${other}`);
    out._backward = () => {
      this.grad += other * Math.pow(this.data, other - 1) * out.grad;
    };
    return out;
  }

  neg() {
    return this.mul(-1);
  }

  sub(other) {
    other = other instanceof Value ? other : new Value(other);
    return this.add(other.neg());
  }

  div(other) {
    other = other instanceof Value ? other : new Value(other);
    return this.mul(other.pow(-1));
  }

  tanh() {
    const t = Math.tanh(this.data);
    const out = new Value(t, [this], "tanh");
    out._backward = () => {
      this.grad += (1 - t * t) * out.grad;
    };
    return out;
  }

  relu() {
    const out = new Value(this.data > 0 ? this.data : 0, [this], "ReLU");
    out._backward = () => {
      this.grad += (out.data > 0 ? 1 : 0) * out.grad;
    };
    return out;
  }

  sigmoid() {
    const s = 1.0 / (1.0 + Math.exp(-this.data));
    const out = new Value(s, [this], "σ");
    out._backward = () => {
      this.grad += s * (1 - s) * out.grad;
    };
    return out;
  }

  exp() {
    const e = Math.exp(this.data);
    const out = new Value(e, [this], "exp");
    out._backward = () => {
      this.grad += e * out.grad;
    };
    return out;
  }

  backward() {
    // Topological sort
    const topo = [];
    const visited = new Set();
    const buildTopo = (v) => {
      if (visited.has(v.id)) return;
      visited.add(v.id);
      for (const child of v._prev) {
        buildTopo(child);
      }
      topo.push(v);
    };
    buildTopo(this);

    // Reset gradients
    for (const v of topo) {
      v.grad = 0.0;
    }
    this.grad = 1.0;

    // Backpropagate in reverse topological order
    for (const v of topo.reverse()) {
      v._backward();
    }
  }

  /**
   * Get all nodes in the computation graph
   * Returns { nodes: Value[], edges: [{from: Value, to: Value}] }
   */
  getGraph() {
    const nodes = [];
    const edges = [];
    const visited = new Set();

    const build = (v) => {
      if (visited.has(v.id)) return;
      visited.add(v.id);
      nodes.push(v);
      for (const child of v._prev) {
        edges.push({ from: child, to: v });
        build(child);
      }
    };
    build(this);
    return { nodes, edges };
  }
}

/**
 * Reset the global ID counter (useful when re-building graphs)
 */
export function resetIdCounter() {
  _globalId = 0;
}

/**
 * Preset computation graph examples
 */
export const PRESETS = [
  {
    name: "Simple Neuron",
    description: "y = tanh(w1·x1 + w2·x2 + b)",
    build: () => {
      resetIdCounter();
      const x1 = new Value(2.0, [], "", "x1");
      const x2 = new Value(0.0, [], "", "x2");
      const w1 = new Value(-3.0, [], "", "w1");
      const w2 = new Value(1.0, [], "", "w2");
      const b = new Value(6.8813735870195432, [], "", "b");

      const x1w1 = x1.mul(w1);  x1w1.label = "x1·w1";
      const x2w2 = x2.mul(w2);  x2w2.label = "x2·w2";
      const sum1 = x1w1.add(x2w2); sum1.label = "sum";
      const n = sum1.add(b); n.label = "n";
      const o = n.tanh(); o.label = "o";
      return { output: o, inputs: { x1, x2 }, weights: { w1, w2, b } };
    },
  },
  {
    name: "Simple Loss",
    description: "loss = (prediction - target)²",
    build: () => {
      resetIdCounter();
      const x = new Value(2.0, [], "", "x");
      const w = new Value(0.5, [], "", "w");
      const b = new Value(-1.0, [], "", "b");
      const target = new Value(4.0, [], "", "target");

      const wx = w.mul(x); wx.label = "w·x";
      const pred = wx.add(b); pred.label = "pred";
      const diff = pred.sub(target); diff.label = "diff";
      const loss = diff.pow(2); loss.label = "loss";
      return { output: loss, inputs: { x }, weights: { w, b }, targets: { target } };
    },
  },
  {
    name: "Two-Layer Network",
    description: "2 neurons → 1 output with tanh",
    build: () => {
      resetIdCounter();
      const x = new Value(1.5, [], "", "x");

      const w1 = new Value(0.8, [], "", "w1");
      const b1 = new Value(-0.2, [], "", "b1");
      const w2 = new Value(-0.5, [], "", "w2");
      const b2 = new Value(0.3, [], "", "b2");

      const h1 = x.mul(w1).add(b1); h1.label = "h1_pre";
      const a1 = h1.tanh(); a1.label = "h1";

      const h2 = x.mul(w2).add(b2); h2.label = "h2_pre";
      const a2 = h2.tanh(); a2.label = "h2";

      const wo1 = new Value(0.6, [], "", "wo1");
      const wo2 = new Value(-0.4, [], "", "wo2");
      const bo = new Value(0.1, [], "", "bo");

      const o1 = a1.mul(wo1); o1.label = "a1·wo1";
      const o2 = a2.mul(wo2); o2.label = "a2·wo2";
      const sum = o1.add(o2); sum.label = "sum";
      const out = sum.add(bo); out.label = "pre_out";
      const y = out.tanh(); y.label = "y";

      return { output: y, inputs: { x }, weights: { w1, b1, w2, b2, wo1, wo2, bo } };
    },
  },
  {
    name: "Sigmoid Gate",
    description: "σ(w·x + b) — logistic regression",
    build: () => {
      resetIdCounter();
      const x = new Value(3.0, [], "", "x");
      const w = new Value(-1.5, [], "", "w");
      const b = new Value(1.0, [], "", "b");

      const wx = w.mul(x); wx.label = "w·x";
      const z = wx.add(b); z.label = "z";
      const out = z.sigmoid(); out.label = "σ(z)";
      return { output: out, inputs: { x }, weights: { w, b } };
    },
  },
];
