# Torchviz Playground

Torchviz Playground is a visual platform to explore and visualize PyTorch neural networks via web browser. It features:
- Interactive Micrograd/PyTorch code visualization
- Trace & shape propagation for networks
- Node-based network visualizations
- A modern Vite+React frontend and FastAPI backend

## Prerequisites

Make sure you have the following installed on your local machine:
- **Node.js** (v18 or higher recommended)
- **Python** (3.8 or higher)
- **Git**

## Setup Guide

The project is structured into two main parts:
1. `frontend` - A React-based web application.
2. `backend` - A FastAPI and PyTorch-based server.

### 1. Frontend Setup

The frontend uses Vite, React, React Flow, and Three.js for interactive visualizations.

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will usually be accessible at `http://localhost:5173`.

### 2. Backend Setup

The backend exposes a REST API powered by FastAPI, allowing tracing of PyTorch architectures and handling other modeling features.

```bash
# Navigate to the backend directory
cd backend

# Create a virtual environment (optional but recommended)
python -m venv venv
# On Windows:
# venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

# Install the Python dependencies
pip install -r requirements.txt

# Start the backend API server
uvicorn app.main:app --reload
```

The backend API will run at `http://localhost:8000`. You can test out the API documentation by visiting `http://localhost:8000/docs`.

## Tech Stack Overview

- **Frontend**: React 19, TypeScript, Vite, React Flow, Three.js, Monaco Editor.
- **Backend**: Python, FastAPI, Uvicorn, PyTorch, Pydantic.
