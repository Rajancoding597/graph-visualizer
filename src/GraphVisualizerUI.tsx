import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  GitBranch,
  Info,
  LayoutGrid,
  MousePointerClick,
  Play,
  RotateCcw,
  Route,
  Search,
  Sparkles,
  Table2,
  Upload,
} from "lucide-react";
import {
  analyzeGraph,
  buildLayout,
  detectGraphFormat,
  detectGraphFormatFromFileName,
  edgeKey,
  findShortestPath,
  getAdjacentNodeIds,
  parseGraph,
  serializeGraph,
  type Edge,
  type ExportFormat,
  type GraphFormat,
  type LayoutMode,
} from "./graphLogic";

type MobileView = "graph" | "analyze" | "edit" | "data";

const EXAMPLES: Record<GraphFormat, { title: string; input: string }> = {
  "edge-list": {
    title: "Weighted route graph",
    input: `A,B,5\nA,C,2\nB,D,1\nC,D,3\nD,E,4\nE,A,2`,
  },
  "adjacency-list": {
    title: "Dependency fanout",
    input: `App: Auth(2), API(1), UI(3)\nAPI: DB(5), Cache(2)\nAuth: DB(1)\nUI: DesignSystem(1)\nCache:`,
  },
  matrix: {
    title: "Adjacency matrix",
    input: `,A,B,C,D\nA,0,5,2,0\nB,0,0,0,1\nC,0,0,0,3\nD,0,0,0,0`,
  },
  json: {
    title: "JSON graph",
    input: JSON.stringify(
      {
        nodes: ["S", "A", "B", "C", "T"],
        edges: [
          { from: "S", to: "A", weight: 1 },
          { from: "S", to: "B", weight: 4 },
          { from: "A", to: "C", weight: 2 },
          { from: "B", to: "C", weight: 3 },
          { from: "C", to: "T", weight: 5 },
        ],
      },
      null,
      2
    ),
  },
  leetcode: {
    title: "LeetCode graph",
    input: `n -> 4\nedges -> [[2,1,1],[2,3,1],[3,4,1]]`,
  },
};

const FORMAT_LABELS: Record<GraphFormat, string> = {
  "edge-list": "Edges",
  "adjacency-list": "Adjacency",
  matrix: "Matrix",
  json: "JSON",
  leetcode: "LeetCode",
};

const FORMAT_DETAILS: Record<GraphFormat, { hint: string; bestFor: string; example: string }> = {
  "edge-list": {
    hint: "One edge per line: from, to, optional weight.",
    bestFor: "CSV exports, quick notes, and simple weighted graphs.",
    example: "A,B,5",
  },
  "adjacency-list": {
    hint: "One source node, then its neighbors.",
    bestFor: "Dependency maps and neighborhood-style data.",
    example: "A: B(5), C:2, D",
  },
  matrix: {
    hint: "Square table where each number is the edge weight.",
    bestFor: "Adjacency matrices from spreadsheets or algorithms.",
    example: ",A,B\\nA,0,5\\nB,0,0",
  },
  json: {
    hint: "Object with nodes and edges, or an array of edge objects.",
    bestFor: "App data, APIs, and saved graph files.",
    example: '{"edges":[{"from":"A","to":"B","weight":5}]}',
  },
  leetcode: {
    hint: "Use n plus an edges array of pairs or triples.",
    bestFor: "LeetCode graph problems such as network delay or valid path inputs.",
    example: "n -> 4\\nedges -> [[2,1,1],[2,3,1]]",
  },
};

const METRIC_HELP: Record<string, string> = {
  Nodes: "Unique node names found in the rendered data.",
  Edges: "Connections between nodes. Repeated edges are counted.",
  Density: "How many possible connections exist in this graph. Higher means more connected.",
  Components: "Disconnected groups when direction is ignored.",
  Cycle: "Whether the graph contains a loop that can return to an earlier node.",
  "Avg weight": "Mean edge weight across all rendered edges.",
};

const LAYOUT_OPTIONS: Array<{ id: LayoutMode; label: string; help: string }> = [
  { id: "circle", label: "Circle", help: "Evenly spaces nodes around a ring." },
  { id: "flow", label: "Flow", help: "Places likely source nodes on the left and downstream nodes to the right." },
  { id: "grid", label: "Grid", help: "Uses an even grid when labels matter more than edge shape." },
];

type SelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

function formatNumber(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function shortLabel(value: string) {
  return value.length > 12 ? `${value.slice(0, 11)}...` : value;
}

function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(
    null
  );
  const tipId = useId();
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);

  const placeTooltip = useCallback(() => {
    if (!buttonRef.current || !bubbleRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    const margin = 12;
    const gap = 8;
    const bottomClearance = isMobile ? 88 : margin;
    const availableAbove = buttonRect.top - margin;
    const availableBelow = window.innerHeight - buttonRect.bottom - bottomClearance;
    const placeBelow = availableBelow >= bubbleRect.height + gap || availableBelow > availableAbove;
    const preferredTop = placeBelow ? buttonRect.bottom + gap : buttonRect.top - bubbleRect.height - gap;
    const maxTop = Math.max(margin, window.innerHeight - bottomClearance - bubbleRect.height);
    const top = Math.min(Math.max(preferredTop, margin), maxTop);
    const halfWidth = bubbleRect.width / 2;
    const left = Math.min(
      Math.max(buttonRect.left + buttonRect.width / 2, margin + halfWidth),
      window.innerWidth - margin - halfWidth
    );
    const offsetParent = bubbleRef.current.offsetParent;
    const offsetRect =
      isMobile && offsetParent instanceof HTMLElement
        ? offsetParent.getBoundingClientRect()
        : ({ left: 0, top: 0 } as Pick<DOMRect, "left" | "top">);

    setPosition({
      left: left - offsetRect.left,
      top: top - offsetRect.top,
      placement: placeBelow ? "below" : "above",
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    placeTooltip();
    const frame = window.requestAnimationFrame(placeTooltip);
    return () => window.cancelAnimationFrame(frame);
  }, [open, placeTooltip, children]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideTap = (event: PointerEvent) => {
      if (event.target instanceof Node && !tipRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, [open, placeTooltip]);

  const tooltipStyle =
    position === null
      ? undefined
      : ({
          "--tooltip-left": `${position.left}px`,
          "--tooltip-top": `${position.top}px`,
          "--tooltip-enter-y": position.placement === "below" ? "4px" : "-4px",
        } as React.CSSProperties);

  return (
    <span ref={tipRef} className={`help-tip${open ? " is-open" : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        className="help-button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={13} />
      </button>
      <span ref={bubbleRef} id={tipId} className="tooltip" role="tooltip" style={tooltipStyle}>
        {children}
      </span>
    </span>
  );
}

function SelectMenu<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className="select-menu"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((visible) => !visible)}
      >
        <span>{selected?.label ?? "Select"}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="select-options" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const optionClass = [option.value === value ? "active" : "", option.description ? "has-description" : ""]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={option.value}
                type="button"
                className={optionClass}
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.description ? <small>{option.description}</small> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: keyof typeof METRIC_HELP; value: React.ReactNode }) {
  return (
    <div className="metric">
      <span>
        {label}
        <HelpTip label={`${label} metric help`}>{METRIC_HELP[label]}</HelpTip>
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function edgeRowKey(edge: Edge, index: number) {
  return `${edge.from}-${edge.to}-${edge.weight}-${index}`;
}

function downloadText(fileName: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GraphVisualizerUI() {
  const [input, setInput] = useState(EXAMPLES["edge-list"].input);
  const [inputFormat, setInputFormat] = useState<GraphFormat>("edge-list");
  const [submitted, setSubmitted] = useState({
    input: EXAMPLES["edge-list"].input,
    format: "edge-list" as GraphFormat,
  });
  const [directed, setDirected] = useState(true);
  const [title, setTitle] = useState(EXAMPLES["edge-list"].title);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("circle");
  const [sourceNode, setSourceNode] = useState("");
  const [targetNode, setTargetNode] = useState("");
  const [focusNode, setFocusNode] = useState("");
  const [showWeights, setShowWeights] = useState(true);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [notice, setNotice] = useState("");
  const [mobileView, setMobileView] = useState<MobileView>("graph");
  const [showExportPreview, setShowExportPreview] = useState(false);

  const parsed = useMemo(
    () => parseGraph(submitted.input, submitted.format),
    [submitted.input, submitted.format]
  );
  const draftParsed = useMemo(() => parseGraph(input, inputFormat), [input, inputFormat]);
  const nodes = parsed.nodes;
  const edges = parsed.edges;
  const analysis = useMemo(() => analyzeGraph(nodes, edges, directed), [nodes, edges, directed]);

  const effectiveSource = nodes.includes(sourceNode) ? sourceNode : nodes[0] ?? "";
  const effectiveTarget = nodes.includes(targetNode) ? targetNode : nodes[nodes.length - 1] ?? "";
  const effectiveFocus = nodes.includes(focusNode) ? focusNode : "";

  const layout = useMemo(
    // Focus is visual only. Feeding it into Flow would re-root the layout and make the graph jump.
    () => buildLayout(nodes, 960, 560, layoutMode, edges, directed),
    [nodes, edges, directed, layoutMode]
  );
  const nodeMap = useMemo(() => new Map(layout.map((node) => [node.id, node])), [layout]);
  const maxWeight = Math.max(1, ...edges.map((edge) => Math.abs(edge.weight)));
  const shortestPath = useMemo(
    () => findShortestPath(nodes, edges, directed, effectiveSource, effectiveTarget),
    [nodes, edges, directed, effectiveSource, effectiveTarget]
  );
  const pathNodeSet = useMemo(() => new Set(shortestPath.path), [shortestPath.path]);
  const focusNeighborSet = useMemo(
    () => getAdjacentNodeIds(nodes, edges, directed, effectiveFocus),
    [nodes, edges, directed, effectiveFocus]
  );
  const exportText = useMemo(
    () => serializeGraph(exportFormat, nodes, edges),
    [exportFormat, nodes, edges]
  );
  const layoutOptions = LAYOUT_OPTIONS.map((option) => ({
    value: option.id,
    label: option.label,
    description: option.help,
  }));
  const focusOptions: Array<SelectOption<string>> = [
    { value: "", label: "All nodes" },
    ...nodes.map((node) => ({ value: node, label: node })),
  ];
  const pathNodeOptions: Array<SelectOption<string>> = nodes.length
    ? nodes.map((node) => ({ value: node, label: node }))
    : [{ value: "", label: "None" }];
  const exportOptions: Array<SelectOption<ExportFormat>> = [
    { value: "json", label: "JSON" },
    { value: "edge-list", label: "Edge list" },
  ];

  const handleRender = () => {
    setSubmitted({ input, format: inputFormat });
    setNotice(`Rendered ${FORMAT_LABELS[inputFormat].toLowerCase()} input.`);
    setMobileView("graph");
  };

  const handleReset = () => {
    setInput(EXAMPLES["edge-list"].input);
    setInputFormat("edge-list");
    setSubmitted({ input: EXAMPLES["edge-list"].input, format: "edge-list" });
    setTitle(EXAMPLES["edge-list"].title);
    setDirected(true);
    setLayoutMode("circle");
    setSourceNode("");
    setTargetNode("");
    setFocusNode("");
    setShowWeights(true);
    setExportFormat("json");
    setMobileView("graph");
    setShowExportPreview(false);
    setNotice("");
  };

  const applyExample = (format: GraphFormat) => {
    setInputFormat(format);
    setInput(EXAMPLES[format].input);
    setSubmitted({ input: EXAMPLES[format].input, format });
    setTitle(EXAMPLES[format].title);
    setFocusNode("");
    setSourceNode("");
    setTargetNode("");
    setMobileView("graph");
    setNotice(`Loaded ${FORMAT_LABELS[format].toLowerCase()} sample.`);
  };

  const handleDetectFormat = () => {
    const detected = detectGraphFormat(input);
    setInputFormat(detected);
    setNotice(`Detected ${FORMAT_LABELS[detected].toLowerCase()} format.`);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const text = await file.text();
    const detected = detectGraphFormatFromFileName(file.name, text);
    const fileTitle = file.name.replace(/\.[^.]+$/, "").trim();
    setInput(text);
    setInputFormat(detected);
    setSubmitted({ input: text, format: detected });
    setTitle(fileTitle || "Uploaded graph");
    setFocusNode("");
    setSourceNode("");
    setTargetNode("");
    setMobileView("graph");
    setNotice(`Uploaded ${file.name} as ${FORMAT_LABELS[detected].toLowerCase()}.`);
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setNotice("Export copied.");
    } catch {
      setNotice("Copy failed. Select the export text manually.");
    }
  };

  const handleDownload = () => {
    const extension = exportFormat === "json" ? "json" : "txt";
    const mimeType = exportFormat === "json" ? "application/json" : "text/plain";
    downloadText(`${title || "graph"}.${extension}`, exportText, mimeType);
    setNotice(`Downloaded ${extension.toUpperCase()} export.`);
  };

  const handleNodeFocus = (nodeId: string) => {
    setFocusNode(nodeId === effectiveFocus ? "" : nodeId);
  };

  const inspectEdge = (edge: Edge) => {
    setSourceNode(edge.from);
    setTargetNode(edge.to);
    setFocusNode("");
    setMobileView("analyze");
    setNotice(`Inspecting route from ${edge.from} to ${edge.to}.`);
  };

  const pathSummary =
    shortestPath.status === "ready"
      ? `Shortest path: ${shortestPath.path.join(" -> ")}. Total weight ${formatNumber(shortestPath.distance)}.`
      : shortestPath.status === "negative-weight"
        ? "Shortest path is disabled because at least one edge has a negative weight."
        : shortestPath.status === "unreachable"
          ? `No path from ${effectiveSource || "source"} to ${effectiveTarget || "target"} with current direction settings.`
          : "Choose a source and target node to inspect the shortest route.";

  const draftStatus = draftParsed.error
    ? draftParsed.error
    : draftParsed.nodes.length
      ? `Ready: ${draftParsed.nodes.length} nodes, ${draftParsed.edges.length} edges.`
      : "Paste graph data or upload a file.";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">
            <Sparkles size={16} />
            Graph Visualizer
          </div>
          <h1>{title || "Untitled graph"}</h1>
        </div>
        <div className="header-pills">
          <div className="status-pill" title="Current edge direction mode">
            <GitBranch size={15} />
            {directed ? "Directed" : "Undirected"}
          </div>
          <div className="status-pill muted-pill" title="Last rendered graph size">
            <FileText size={15} />
            {nodes.length} nodes, {edges.length} edges
          </div>
        </div>
      </header>

      {notice ? (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      ) : null}

      <nav className="mobile-jump-nav" aria-label="Graph workspace sections">
        <button
          type="button"
          className={mobileView === "graph" ? "active" : ""}
          onClick={() => setMobileView("graph")}
        >
          <LayoutGrid size={15} />
          Graph
        </button>
        <button
          type="button"
          className={mobileView === "analyze" ? "active" : ""}
          onClick={() => setMobileView("analyze")}
        >
          <Search size={15} />
          Analyze
        </button>
        <button
          type="button"
          className={mobileView === "edit" ? "active" : ""}
          onClick={() => setMobileView("edit")}
        >
          <Table2 size={15} />
          Edit
        </button>
        <button
          type="button"
          className={mobileView === "data" ? "active" : ""}
          onClick={() => setMobileView("data")}
        >
          <FileText size={15} />
          Data
        </button>
      </nav>

      <main className="workspace-grid">
        <aside className={`panel input-panel mobile-screen ${mobileView === "edit" ? "is-active" : ""}`} id="graph-input">
          <div className="panel-title">
            <Table2 size={18} />
            Input
            <HelpTip label="Input panel help">
              Pick the shape of your data, paste or upload it, then render. The editor is never changed unless you
              choose a sample, upload a file, or reset.
            </HelpTip>
          </div>

          <label className="field-label" htmlFor="graph-title">
            Title
          </label>
          <input
            id="graph-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Graph title"
            title="Name shown at the top of the workspace"
          />

          <div className="field-row">
            <span className="field-label">Input format</span>
            <button type="button" className="text-action" onClick={handleDetectFormat} title="Guess the format from the text">
              <Sparkles size={14} />
              Detect
            </button>
          </div>
          <div className="segmented" role="group" aria-label="Input format">
            {(Object.keys(FORMAT_LABELS) as GraphFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                className={inputFormat === format ? "active" : ""}
                onClick={() => setInputFormat(format)}
                title={`${FORMAT_LABELS[format]}: ${FORMAT_DETAILS[format].hint}`}
              >
                {FORMAT_LABELS[format]}
              </button>
            ))}
          </div>

          <div className="format-card">
            <div>
              <strong>{FORMAT_DETAILS[inputFormat].hint}</strong>
              <span>{FORMAT_DETAILS[inputFormat].bestFor}</span>
            </div>
            <code>{FORMAT_DETAILS[inputFormat].example}</code>
          </div>

          <textarea
            aria-label="Graph input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={EXAMPLES[inputFormat].input}
            title="Paste graph data here"
          />

          <div className={draftParsed.error ? "input-status error" : "input-status"}>
            {draftParsed.error ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
            {draftStatus}
          </div>

          <div className="switch-row">
            <span className="switch-control" title="When on, A,B means A points to B. When off, the edge works both ways.">
              <label>
                <input
                  type="checkbox"
                  checked={directed}
                  onChange={(event) => setDirected(event.target.checked)}
                />
                Directed
              </label>
              <HelpTip label="Directed graph help">A directed edge has an arrow. Turn this off for two-way links.</HelpTip>
            </span>
            <span className="switch-control" title="Show or hide numeric edge labels on the graph.">
              <label>
                <input
                  type="checkbox"
                  checked={showWeights}
                  onChange={(event) => setShowWeights(event.target.checked)}
                />
                Weights
              </label>
              <HelpTip label="Weights help">Weights affect line thickness and shortest-path distance.</HelpTip>
            </span>
          </div>

          <div className="button-row mobile-sticky-actions">
            <button type="button" className="primary-button" onClick={handleRender} title="Parse the editor and redraw the graph">
              <Play size={16} />
              Render graph
            </button>
            <button type="button" className="ghost-button" onClick={handleReset} title="Restore the default sample graph">
              <RotateCcw size={16} />
              Reset
            </button>
          </div>

          <div className="file-actions">
            <label className="ghost-button upload-button" title="Upload a .txt, .csv, .json, .adj, .matrix, or .leetcode file">
              <Upload size={16} />
              Upload file
              <input type="file" accept=".txt,.csv,.json,.adj,.alist,.matrix,.leetcode,.lc" onChange={handleFileUpload} />
            </label>
          </div>

          <details className="guide">
            <summary>
              <BookOpen size={15} />
              Format guide and samples
            </summary>
            <div className="example-row">
              {(Object.keys(EXAMPLES) as GraphFormat[]).map((format) => (
                <button key={format} type="button" onClick={() => applyExample(format)}>
                  Load {FORMAT_LABELS[format]} sample
                </button>
              ))}
            </div>
          </details>

          {parsed.error ? (
            <div className="alert">
              <AlertCircle size={16} />
              <span>{parsed.error}</span>
            </div>
          ) : null}
        </aside>

        <section className="visual-stack">
          <div className={`panel visual-panel mobile-screen ${mobileView === "graph" ? "is-active" : ""}`} id="graph-view">
            <div className="toolbar">
              <div className="panel-title">
                <LayoutGrid size={18} />
                View
                <HelpTip label="View panel help">
                  Change the layout without changing the graph data. Click a node to focus it.
                </HelpTip>
              </div>
              <div className="toolbar-controls">
                <div className="select-field">
                  <span className="label-with-help">
                    Layout
                    <HelpTip label="Layout type help">
                      <span className="tooltip-stack">
                        {LAYOUT_OPTIONS.map((option) => (
                          <span key={option.id}>
                            <strong>{option.label}:</strong> {option.help}
                          </span>
                        ))}
                      </span>
                    </HelpTip>
                  </span>
                  <SelectMenu
                    ariaLabel="Layout"
                    value={layoutMode}
                    options={layoutOptions}
                    onChange={setLayoutMode}
                  />
                </div>
                <div className="select-field">
                  <span>Focus</span>
                  <SelectMenu
                    ariaLabel="Focus node"
                    value={effectiveFocus}
                    options={focusOptions}
                    onChange={setFocusNode}
                  />
                </div>
              </div>
            </div>

            <div className="graph-legend" aria-label="Graph legend">
              <span>
                <i className="legend-line path" />
                Shortest path
              </span>
              <span>
                <i className="legend-node focus" />
                Focused node
              </span>
              <span>
                <i className="legend-line normal" />
                Thicker line = higher weight
              </span>
              <span>
                <MousePointerClick size={14} />
                Select a node to focus it
              </span>
            </div>

            <div className="canvas-wrap">
              <svg viewBox="0 0 960 560" className="graph-canvas" role="img" aria-label="Rendered graph">
                <defs>
                  <marker id="arrow-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(224 18% 42%)" />
                  </marker>
                  <marker id="arrow-path" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(18 92% 48%)" />
                  </marker>
                  <marker id="arrow-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(174 74% 34%)" />
                  </marker>
                </defs>

                {Array.from({ length: 13 }).map((_, index) => (
                  <line key={`v-${index}`} className="grid-line" x1={index * 80} y1={0} x2={index * 80} y2={560} />
                ))}
                {Array.from({ length: 9 }).map((_, index) => (
                  <line key={`h-${index}`} className="grid-line" x1={0} y1={index * 70} x2={960} y2={index * 70} />
                ))}

                {nodes.length === 0 ? (
                  <text x="480" y="280" textAnchor="middle" className="empty-state">
                    Render a graph to see it here.
                  </text>
                ) : null}

                {edges.map((edge, index) => {
                  const from = nodeMap.get(edge.from);
                  const to = nodeMap.get(edge.to);
                  if (!from || !to) return null;

                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                  const offset = 31;
                  const sx = from.x + (dx / distance) * offset;
                  const sy = from.y + (dy / distance) * offset;
                  const ex = to.x - (dx / distance) * offset;
                  const ey = to.y - (dy / distance) * offset;
                  const mx = (sx + ex) / 2;
                  const my = (sy + ey) / 2 - Math.min(24, Math.abs(edge.weight) * 0.8);
                  const strokeWidth = 1.3 + (Math.abs(edge.weight) / maxWeight) * 3.2;
                  const isPathEdge = shortestPath.edgeKeys.has(edgeKey(edge.from, edge.to, directed));
                  const isFocusEdge =
                    Boolean(effectiveFocus) && (edge.from === effectiveFocus || edge.to === effectiveFocus);
                  const stroke = isPathEdge
                    ? "hsl(18 92% 48%)"
                    : isFocusEdge
                      ? "hsl(174 74% 34%)"
                      : "hsl(224 18% 42%)";
                  const markerId = isPathEdge ? "arrow-path" : isFocusEdge ? "arrow-focus" : "arrow-default";
                  const label = formatNumber(edge.weight);
                  const labelWidth = Math.max(34, label.length * 7 + 16);

                  return (
                    <g key={edgeRowKey(edge, index)}>
                      <line
                        x1={sx}
                        y1={sy}
                        x2={ex}
                        y2={ey}
                        stroke={stroke}
                        strokeOpacity={isPathEdge || isFocusEdge ? 0.95 : 0.55}
                        strokeWidth={isPathEdge ? strokeWidth + 0.8 : strokeWidth}
                        markerEnd={directed ? `url(#${markerId})` : undefined}
                      />
                      {showWeights ? (
                        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                          <rect
                            x={mx - labelWidth / 2}
                            y={my - 12}
                            width={labelWidth}
                            height={22}
                            rx={8}
                            className="weight-bg"
                          />
                          <text x={mx} y={my + 4} textAnchor="middle" className="weight-label">
                            {label}
                          </text>
                        </motion.g>
                      ) : null}
                    </g>
                  );
                })}

                {layout.map((node) => {
                  const isPathNode = pathNodeSet.has(node.id);
                  const isFocus = node.id === effectiveFocus;
                  const isNeighbor = focusNeighborSet.has(node.id);
                  const fill = isPathNode
                    ? "hsl(45 93% 84%)"
                    : isFocus
                      ? "hsl(174 72% 84%)"
                      : isNeighbor
                        ? "hsl(174 62% 92%)"
                        : "hsl(var(--background))";

                  return (
                    <motion.g
                      key={node.id}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      role="button"
                      tabIndex={0}
                      className="node-hit-area"
                      aria-label={`Focus node ${node.id}`}
                      onClick={() => handleNodeFocus(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleNodeFocus(node.id);
                        }
                      }}
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={27}
                        fill={fill}
                        stroke={isPathNode ? "hsl(18 92% 48%)" : "hsl(var(--border))"}
                        strokeWidth={isPathNode || isFocus ? 3 : 2}
                      />
                      <text x={node.x} y={node.y + 5} textAnchor="middle" className="node-label">
                        {shortLabel(node.id)}
                      </text>
                      <title>{node.id}. Click to focus this node.</title>
                    </motion.g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className={`panel analysis-panel mobile-screen ${mobileView === "analyze" ? "is-active" : ""}`} id="graph-analysis">
            <div className="analysis-header">
              <div className="panel-title">
                <Search size={18} />
                Analyze
                <HelpTip label="Analyze panel help">
                  Pick a start and end node to highlight the lowest-weight path. Metrics update from the rendered graph.
                </HelpTip>
              </div>
              <div className="path-controls">
                <div className="select-field">
                  <span>Shortest path from</span>
                  <SelectMenu
                    ariaLabel="Shortest path source"
                    value={effectiveSource}
                    options={pathNodeOptions}
                    onChange={setSourceNode}
                  />
                </div>
                <div className="select-field">
                  <span>To</span>
                  <SelectMenu
                    ariaLabel="Shortest path target"
                    value={effectiveTarget}
                    options={pathNodeOptions}
                    onChange={setTargetNode}
                  />
                </div>
              </div>
            </div>

            <div className="metric-grid">
              <Metric label="Nodes" value={analysis.nodeCount} />
              <Metric label="Edges" value={analysis.edgeCount} />
              <Metric label="Density" value={`${formatNumber(analysis.density * 100, 1)}%`} />
              <Metric label="Components" value={analysis.componentCount} />
              <Metric label="Cycle" value={analysis.hasCycle ? "Yes" : "No"} />
              <Metric label="Avg weight" value={formatNumber(analysis.averageWeight)} />
            </div>

            <div className="route-summary">
              <Route size={18} />
              <span>{pathSummary}</span>
            </div>

            <div className="analysis-grid">
              <div>
                <h2>Most connected nodes</h2>
                <ul className="compact-list">
                  {analysis.topDegreeNodes.length === 0 ? (
                    <li>No nodes yet.</li>
                  ) : (
                    analysis.topDegreeNodes.map((row) => (
                      <li key={row.id}>
                        <span>{row.id}</span>
                        <strong>{row.totalDegree} links</strong>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h2>Health checks</h2>
                <ul className="compact-list">
                  <li>
                    <span>Isolated nodes</span>
                    <strong>{analysis.isolatedNodes.length ? analysis.isolatedNodes.join(", ") : "None"}</strong>
                  </li>
                  <li>
                    <span>Weight range</span>
                    <strong>
                      {formatNumber(analysis.minWeight)} to {formatNumber(analysis.maxWeight)}
                    </strong>
                  </li>
                  <li>
                    <span>Negative edges</span>
                    <strong>{analysis.hasNegativeWeight ? "Present" : "None"}</strong>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className={`panel data-panel mobile-screen ${mobileView === "data" ? "is-active" : ""}`} id="graph-data">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.length === 0 ? (
                    <tr>
                      <td colSpan={3}>No edges rendered.</td>
                    </tr>
                  ) : (
                    edges.map((edge, index) => (
                      <tr
                        key={edgeRowKey(edge, index)}
                        className={shortestPath.edgeKeys.has(edgeKey(edge.from, edge.to, directed)) ? "selected-row" : ""}
                        onClick={() => inspectEdge(edge)}
                        title={`Click to inspect the route from ${edge.from} to ${edge.to}`}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            inspectEdge(edge);
                          }
                        }}
                      >
                        <td data-label="From">{edge.from}</td>
                        <td data-label="To">{edge.to}</td>
                        <td data-label="Weight">{formatNumber(edge.weight)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="edge-card-list" aria-label="Rendered edges">
              {edges.length === 0 ? (
                <div className="edge-card empty-card">No edges rendered.</div>
              ) : (
                edges.map((edge, index) => (
                  <button
                    key={edgeRowKey(edge, index)}
                    type="button"
                    className={
                      shortestPath.edgeKeys.has(edgeKey(edge.from, edge.to, directed))
                        ? "edge-card selected-row"
                        : "edge-card"
                    }
                    onClick={() => inspectEdge(edge)}
                  >
                    <span className="edge-route">
                      <strong>{edge.from}</strong>
                      <span>to</span>
                      <strong>{edge.to}</strong>
                    </span>
                    <span className="edge-weight">{formatNumber(edge.weight)}</span>
                  </button>
                ))
              )}
            </div>

            <div className="export-box">
              <div className="export-actions">
                <div className="select-field">
                  <span>Export rendered graph</span>
                  <SelectMenu
                    ariaLabel="Export format"
                    value={exportFormat}
                    options={exportOptions}
                    onChange={setExportFormat}
                  />
                </div>
                <div className="export-buttons">
                  <button
                    type="button"
                    className="ghost-button preview-toggle"
                    onClick={() => setShowExportPreview((visible) => !visible)}
                    title="Show or hide the export text preview"
                  >
                    <FileText size={16} />
                    {showExportPreview ? "Hide preview" : "Preview"}
                  </button>
                  <button type="button" className="ghost-button" onClick={copyExport} title="Copy export text to clipboard">
                    <Copy size={16} />
                    Copy
                  </button>
                  <button type="button" className="ghost-button" onClick={handleDownload} title="Download the rendered graph">
                    <Download size={16} />
                    Download
                  </button>
                </div>
              </div>
              <textarea
                readOnly
                value={exportText}
                className={showExportPreview ? "export-preview is-open" : "export-preview"}
                aria-label="Graph export"
                title="Rendered graph export"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
