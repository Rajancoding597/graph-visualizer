# Graph Visualizer

Interactive React graph visualizer for exploring weighted directed and undirected graphs.

The app accepts multiple graph input formats, renders the graph in different layouts, highlights shortest paths, analyzes graph health, and exports the rendered graph.

## Features

- Visual graph rendering with Circle, Flow, and Grid layouts
- Directed and undirected graph modes
- Optional edge weights with thicker weighted lines
- Node focus mode with neighbor highlighting
- Shortest-path analysis for non-negative weighted graphs
- Graph metrics including density, components, cycles, top connected nodes, and weight range
- Mobile-friendly UI with tap-friendly controls and anchored tooltips
- Export to JSON or edge-list text

## Supported Input Formats

### Edge List

```txt
A,B,5
A,C,2
B,D,1
```

### Adjacency List

```txt
A: B(5), C:2
B: D(1)
```

### Matrix

```txt
,A,B,C
A,0,5,2
B,0,0,1
C,0,0,0
```

### JSON

```json
{
  "nodes": ["A", "B", "C"],
  "edges": [
    { "from": "A", "to": "B", "weight": 5 },
    { "from": "A", "to": "C", "weight": 2 }
  ]
}
```

### LeetCode Style

```txt
n -> 4
edges -> [[2,1,1],[2,3,1],[3,4,1]]
```

Plain edge arrays are also supported:

```txt
[[2,1,1],[2,3,1],[3,4,1]]
```

## Getting Started

Install dependencies:

```bash
npm ci
```

Run the local development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run tests:

```bash
npm run test
```

## Requirements

- Node.js 20.19 or newer
- npm

## Project Structure

```txt
src/
  GraphVisualizerUI.tsx  Main React UI
  graphLogic.ts          Parsing, layout, analysis, shortest path, and export logic
  graphLogic.test.ts     Unit tests for parsing, analysis, layout, and export behavior
  main.tsx               React entrypoint
```

## GitHub Notes

Do not commit `node_modules/`, `dist/`, logs, local environment files, or generated test output. These are covered by `.gitignore`.
