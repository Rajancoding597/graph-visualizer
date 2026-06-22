export type GraphFormat = "edge-list" | "adjacency-list" | "matrix" | "json" | "leetcode";
export type LayoutMode = "circle" | "grid" | "flow";
export type ExportFormat = "edge-list" | "json";

export type Edge = {
  from: string;
  to: string;
  weight: number;
};

export type PositionedNode = {
  id: string;
  x: number;
  y: number;
};

export type ParseResult = {
  nodes: string[];
  edges: Edge[];
  error?: string;
};

export type DegreeRow = {
  id: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
};

export type GraphAnalysis = {
  nodeCount: number;
  edgeCount: number;
  density: number;
  componentCount: number;
  isolatedNodes: string[];
  hasCycle: boolean;
  hasNegativeWeight: boolean;
  minWeight: number | null;
  maxWeight: number | null;
  totalWeight: number;
  averageWeight: number | null;
  topDegreeNodes: DegreeRow[];
};

export type ShortestPathResult = {
  status: "ready" | "missing-node" | "negative-weight" | "unreachable";
  distance: number | null;
  path: string[];
  edgeKeys: Set<string>;
};

type Accumulator = {
  nodes: string[];
  nodeSet: Set<string>;
  edges: Edge[];
};

const MAX_NODES = 200;
const MAX_EDGES = 5000;

function createAccumulator(): Accumulator {
  return { nodes: [], nodeSet: new Set<string>(), edges: [] };
}

function cleanLines(input: string) {
  return input
    .split(/\r?\n+/)
    .map((line) => line.replace(/\/\/.*$/, "").replace(/#.*$/, "").trim())
    .filter(Boolean);
}

function isNumeric(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function parseWeight(raw: unknown, fallback = 1) {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function addNode(acc: Accumulator, raw: unknown) {
  const id = String(raw ?? "").trim();
  if (!id) {
    return null;
  }

  if (!acc.nodeSet.has(id)) {
    acc.nodeSet.add(id);
    acc.nodes.push(id);
  }

  return id;
}

function addEdge(acc: Accumulator, fromRaw: unknown, toRaw: unknown, weightRaw?: unknown) {
  const from = addNode(acc, fromRaw);
  const to = addNode(acc, toRaw);
  if (!from || !to) {
    return "Missing a node name.";
  }

  const weight = parseWeight(weightRaw);
  if (weight === null) {
    return "Invalid edge weight.";
  }

  acc.edges.push({ from, to, weight });
  return null;
}

function finalize(acc: Accumulator): ParseResult {
  if (acc.nodes.length > MAX_NODES) {
    return { nodes: [], edges: [], error: `This preview supports up to ${MAX_NODES} nodes.` };
  }

  if (acc.edges.length > MAX_EDGES) {
    return { nodes: [], edges: [], error: `This preview supports up to ${MAX_EDGES} edges.` };
  }

  return { nodes: acc.nodes, edges: acc.edges };
}

function parseEdgeList(input: string): ParseResult {
  const lines = cleanLines(input);
  const acc = createAccumulator();

  for (const [index, line] of lines.entries()) {
    const parts = (line.includes(",") ? line.split(",") : line.split(/\s+/))
      .map((part) => part.trim())
      .filter(Boolean);

    if (
      index === 0 &&
      parts.length >= 2 &&
      ["from", "source"].includes(parts[0].toLowerCase()) &&
      ["to", "target"].includes(parts[1].toLowerCase())
    ) {
      continue;
    }

    if (parts.length < 2 || parts.length > 3) {
      return { nodes: [], edges: [], error: `Line ${index + 1} should be: from,to,weight.` };
    }

    const error = addEdge(acc, parts[0], parts[1], parts[2]);
    if (error) {
      return { nodes: [], edges: [], error: `Line ${index + 1}: ${error}` };
    }
  }

  return finalize(acc);
}

function parseWeightedNode(token: string) {
  const trimmed = token.trim();
  const parenMatch = trimmed.match(/^(.+?)\s*\(\s*([-+]?\d*\.?\d+)\s*\)$/);
  if (parenMatch) {
    return { node: parenMatch[1].trim(), weight: Number(parenMatch[2]) };
  }

  const colonMatch = trimmed.match(/^(.+?)\s*:\s*([-+]?\d*\.?\d+)$/);
  if (colonMatch) {
    return { node: colonMatch[1].trim(), weight: Number(colonMatch[2]) };
  }

  const spaceParts = trimmed.split(/\s+/);
  const last = spaceParts[spaceParts.length - 1];
  if (spaceParts.length > 1 && isNumeric(last)) {
    return {
      node: spaceParts.slice(0, -1).join(" ").trim(),
      weight: Number(last),
    };
  }

  return { node: trimmed, weight: 1 };
}

function parseAdjacencyList(input: string): ParseResult {
  const lines = cleanLines(input);
  const acc = createAccumulator();

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(.+?)\s*(?:->|:|=)\s*(.*)$/);
    if (!match) {
      return { nodes: [], edges: [], error: `Line ${index + 1} should look like A: B(2), C.` };
    }

    const source = addNode(acc, match[1]);
    if (!source) {
      return { nodes: [], edges: [], error: `Line ${index + 1}: Missing a source node.` };
    }

    const neighbors = match[2]
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const token of neighbors) {
      const parsed = parseWeightedNode(token);
      const error = addEdge(acc, source, parsed.node, parsed.weight);
      if (error) {
        return { nodes: [], edges: [], error: `Line ${index + 1}: ${error}` };
      }
    }
  }

  return finalize(acc);
}

function tokenizeMatrixLine(line: string) {
  return line.includes(",")
    ? line.split(",").map((cell) => cell.trim())
    : line.trim().split(/\s+/).map((cell) => cell.trim());
}

function defaultMatrixNames(count: number) {
  return Array.from({ length: count }, (_, index) =>
    count <= 26 ? String.fromCharCode(65 + index) : `N${index + 1}`
  );
}

function parseMatrix(input: string): ParseResult {
  const rows = cleanLines(input).map(tokenizeMatrixLine);
  const acc = createAccumulator();

  if (rows.length === 0) {
    return finalize(acc);
  }

  const firstRow = rows[0];
  const firstRowIsHeader =
    firstRow[0] === "" || firstRow.every((cell) => cell !== "" && !isNumeric(cell));
  const rowsHaveLeadingLabels =
    !firstRowIsHeader &&
    rows.every((row) => row.length === rows.length + 1 && !isNumeric(row[0]) && row.slice(1).every(isNumeric));

  let names: string[];
  let valueRows: string[][];

  if (firstRowIsHeader) {
    names = firstRow[0] === "" ? firstRow.slice(1) : firstRow;
    const dataRows = rows.slice(1);
    const hasRowLabels = dataRows.every((row) => row.length === names.length + 1);
    valueRows = [];
    for (const [index, row] of dataRows.entries()) {
      const values = hasRowLabels ? row.slice(1) : row;
      if (values.length !== names.length) {
        return {
          nodes: [],
          edges: [],
          error: `Row ${index + 2} does not match the matrix width.`,
        };
      }
      valueRows.push(values);
    }
  } else if (rowsHaveLeadingLabels) {
    names = rows.map((row) => row[0]);
    valueRows = rows.map((row) => row.slice(1));
  } else {
    names = defaultMatrixNames(rows.length);
    valueRows = rows;
  }

  if (names.length === 0 || valueRows.length !== names.length) {
    return { nodes: [], edges: [], error: "Matrix should have the same number of rows and columns." };
  }

  if (new Set(names).size !== names.length || names.some((name) => !name.trim())) {
    return { nodes: [], edges: [], error: "Matrix node labels must be unique and non-empty." };
  }

  try {
    for (const name of names) {
      addNode(acc, name);
    }

    for (const [rowIndex, row] of valueRows.entries()) {
      if (row.length !== names.length) {
        return {
          nodes: [],
          edges: [],
          error: `Row ${rowIndex + 1} does not match the matrix width.`,
        };
      }

      for (const [columnIndex, cell] of row.entries()) {
        const raw = cell.trim();
        if (raw === "" || raw === ".") {
          continue;
        }

        const weight = Number(raw);
        if (!Number.isFinite(weight)) {
          return {
            nodes: [],
            edges: [],
            error: `Cell ${rowIndex + 1},${columnIndex + 1} is not a number.`,
          };
        }

        if (weight !== 0) {
          acc.edges.push({ from: names[rowIndex], to: names[columnIndex], weight });
        }
      }
    }
  } catch (error) {
    return { nodes: [], edges: [], error: error instanceof Error ? error.message : "Invalid matrix." };
  }

  return finalize(acc);
}

function parseJson(input: string): ParseResult {
  const acc = createAccumulator();
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return { nodes: [], edges: [], error: "JSON could not be parsed." };
  }

  const addJsonEdge = (edge: unknown, index: number) => {
    if (!edge || typeof edge !== "object") {
      return `Edge ${index + 1} should be an object.`;
    }

    const record = edge as Record<string, unknown>;
    const from = record.from ?? record.source;
    const to = record.to ?? record.target;
    const weight = record.weight ?? record.value ?? 1;
    return addEdge(acc, from, to, weight);
  };

  if (Array.isArray(parsed)) {
    for (const [index, edge] of parsed.entries()) {
      const error = addJsonEdge(edge, index);
      if (error) {
        return { nodes: [], edges: [], error };
      }
    }
    return finalize(acc);
  }

  if (!parsed || typeof parsed !== "object") {
    return { nodes: [], edges: [], error: "JSON should be an object or an array of edges." };
  }

  const record = parsed as Record<string, unknown>;

  if (Array.isArray(record.nodes)) {
    for (const node of record.nodes) {
      if (typeof node === "object" && node !== null && "id" in node) {
        addNode(acc, (node as { id: unknown }).id);
      } else {
        addNode(acc, node);
      }
    }
  }

  const edges = Array.isArray(record.edges)
    ? record.edges
    : Array.isArray(record.links)
      ? record.links
      : null;

  if (edges) {
    for (const [index, edge] of edges.entries()) {
      const error = addJsonEdge(edge, index);
      if (error) {
        return { nodes: [], edges: [], error };
      }
    }
    return finalize(acc);
  }

  if (record.adjacency && typeof record.adjacency === "object") {
    for (const [from, value] of Object.entries(record.adjacency as Record<string, unknown>)) {
      addNode(acc, from);
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") {
            const error = addEdge(acc, from, item, 1);
            if (error) return { nodes: [], edges: [], error };
          } else {
            const error = addJsonEdge({ ...(item as Record<string, unknown>), from }, acc.edges.length);
            if (error) return { nodes: [], edges: [], error };
          }
        }
      } else if (value && typeof value === "object") {
        for (const [to, weight] of Object.entries(value as Record<string, unknown>)) {
          const error = addEdge(acc, from, to, weight);
          if (error) return { nodes: [], edges: [], error };
        }
      }
    }
    return finalize(acc);
  }

  return { nodes: [], edges: [], error: "JSON should include edges, links, or adjacency." };
}

function getBalancedArrayAfterKey(input: string, key: string) {
  const keyMatch = new RegExp(`\\b${key}\\b\\s*(?:=|:|->)\\s*`, "i").exec(input);
  const startSearchIndex = keyMatch ? keyMatch.index + keyMatch[0].length : 0;
  const start = input.indexOf("[", startSearchIndex);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (character === "[") depth += 1;
    if (character === "]") depth -= 1;
    if (depth === 0) {
      return input.slice(start, index + 1);
    }
  }

  return null;
}

function parseLeetcode(input: string): ParseResult {
  const acc = createAccumulator();
  const nMatch = input.match(/\bn\b\s*(?:=|:|->)\s*(\d+)/i);
  const rawArray = getBalancedArrayAfterKey(input, "edges") ?? getBalancedArrayAfterKey(input, "times") ?? getBalancedArrayAfterKey(input, "");

  if (!rawArray) {
    return { nodes: [], edges: [], error: "LeetCode input should include edges = [[from,to,weight], ...]." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArray);
  } catch {
    return { nodes: [], edges: [], error: "LeetCode edges should be a valid array like [[2,1,1],[2,3,1]]." };
  }

  if (!Array.isArray(parsed) || parsed.some((edge) => !Array.isArray(edge))) {
    return { nodes: [], edges: [], error: "LeetCode edges should be an array of arrays." };
  }

  let maxNode = nMatch ? Number(nMatch[1]) : 0;
  for (const [index, edge] of parsed.entries()) {
    if (edge.length < 2 || edge.length > 3) {
      return { nodes: [], edges: [], error: `Edge ${index + 1} should be [from,to] or [from,to,weight].` };
    }

    const [from, to, weight = 1] = edge;
    if (!Number.isFinite(Number(from)) || !Number.isFinite(Number(to))) {
      return { nodes: [], edges: [], error: `Edge ${index + 1} has invalid node numbers.` };
    }

    maxNode = Math.max(maxNode, Number(from), Number(to));
    const error = addEdge(acc, from, to, weight);
    if (error) {
      return { nodes: [], edges: [], error: `Edge ${index + 1}: ${error}` };
    }
  }

  for (let node = 1; node <= maxNode; node += 1) {
    addNode(acc, node);
  }

  acc.nodes.sort((left, right) => Number(left) - Number(right));
  return finalize(acc);
}

export function parseGraph(input: string, format: GraphFormat): ParseResult {
  if (!input.trim()) {
    return { nodes: [], edges: [] };
  }

  switch (format) {
    case "edge-list":
      return parseEdgeList(input);
    case "adjacency-list":
      return parseAdjacencyList(input);
    case "matrix":
      return parseMatrix(input);
    case "json":
      return parseJson(input);
    case "leetcode":
      return parseLeetcode(input);
    default:
      return { nodes: [], edges: [], error: "Unsupported graph format." };
  }
}

export function detectGraphFormat(input: string): GraphFormat {
  const trimmed = input.trim();
  if (!trimmed) {
    return "edge-list";
  }

  if (/^\s*(?:n|edges|times)\b\s*(?:=|:|->)/i.test(trimmed)) {
    return "leetcode";
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((edge) => Array.isArray(edge))) {
        return "leetcode";
      }
    } catch {
      return "json";
    }
    return "json";
  }

  if (trimmed.startsWith("{")) {
    return "json";
  }

  const lines = cleanLines(input);
  if (lines.some((line) => /^.+?\s*(?:->|:|=)\s*.*$/.test(line))) {
    return "adjacency-list";
  }

  const tokenized = lines.map(tokenizeMatrixLine);
  const looksLikeMatrix =
    tokenized.length > 1 &&
    tokenized.every((row) => row.length === tokenized[0].length) &&
    (tokenized.every((row) => row.every((cell) => cell === "" || cell === "." || isNumeric(cell))) ||
      tokenized.slice(1).every((row) => row.slice(1).every((cell) => cell === "." || isNumeric(cell))));

  if (looksLikeMatrix) {
    return "matrix";
  }

  return "edge-list";
}

export function detectGraphFormatFromFileName(fileName: string, input: string): GraphFormat {
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension === "json") {
    return "json";
  }

  if (extension === "leetcode" || extension === "lc") {
    return "leetcode";
  }

  if (extension === "matrix") {
    return "matrix";
  }

  if (extension === "adj" || extension === "alist") {
    return "adjacency-list";
  }

  return detectGraphFormat(input);
}

export function edgeKey(from: string, to: string, directed: boolean) {
  return directed ? `${from}->${to}` : [from, to].sort().join("--");
}

function buildAdjacency(nodes: string[], edges: Edge[], directed: boolean) {
  const adjacency = new Map<string, Array<{ to: string; weight: number }>>();
  for (const node of nodes) {
    adjacency.set(node, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push({ to: edge.to, weight: edge.weight });
    if (!directed) {
      adjacency.get(edge.to)?.push({ to: edge.from, weight: edge.weight });
    }
  }

  return adjacency;
}

export function getAdjacentNodeIds(nodes: string[], edges: Edge[], directed: boolean, nodeId: string) {
  if (!nodeId || !nodes.includes(nodeId)) {
    return new Set<string>();
  }

  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (edge.from === nodeId) {
      neighbors.add(edge.to);
    }
    if (!directed && edge.to === nodeId) {
      neighbors.add(edge.from);
    }
    if (directed && edge.to === nodeId) {
      neighbors.add(edge.from);
    }
  }

  return neighbors;
}

function hasDirectedCycle(nodes: string[], edges: Edge[]) {
  const adjacency = buildAdjacency(nodes, edges, true);
  const state = new Map<string, "visiting" | "visited">();

  const visit = (node: string): boolean => {
    if (state.get(node) === "visiting") return true;
    if (state.get(node) === "visited") return false;

    state.set(node, "visiting");
    for (const neighbor of adjacency.get(node) ?? []) {
      if (visit(neighbor.to)) return true;
    }
    state.set(node, "visited");
    return false;
  };

  return nodes.some((node) => visit(node));
}

function hasUndirectedCycle(nodes: string[], edges: Edge[]) {
  const adjacency = buildAdjacency(nodes, edges, false);
  const visited = new Set<string>();

  const visit = (node: string, parent: string | null): boolean => {
    visited.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor.to)) {
        if (visit(neighbor.to, node)) return true;
      } else if (neighbor.to !== parent) {
        return true;
      }
    }
    return false;
  };

  return nodes.some((node) => !visited.has(node) && visit(node, null));
}

function countWeakComponents(nodes: string[], edges: Edge[]) {
  const adjacency = buildAdjacency(nodes, edges, false);
  const visited = new Set<string>();
  let components = 0;

  for (const node of nodes) {
    if (visited.has(node)) continue;
    components += 1;
    const queue = [node];
    visited.add(node);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of adjacency.get(queue[cursor]) ?? []) {
        if (!visited.has(neighbor.to)) {
          visited.add(neighbor.to);
          queue.push(neighbor.to);
        }
      }
    }
  }

  return components;
}

export function analyzeGraph(nodes: string[], edges: Edge[], directed: boolean): GraphAnalysis {
  const degreeMap = new Map<string, DegreeRow>();
  for (const node of nodes) {
    degreeMap.set(node, { id: node, inDegree: 0, outDegree: 0, totalDegree: 0 });
  }

  for (const edge of edges) {
    const from = degreeMap.get(edge.from);
    const to = degreeMap.get(edge.to);
    if (!from || !to) continue;

    from.outDegree += 1;
    to.inDegree += 1;

    if (directed) {
      from.totalDegree += 1;
      to.totalDegree += 1;
    } else if (edge.from === edge.to) {
      from.totalDegree += 2;
    } else {
      from.totalDegree += 1;
      to.totalDegree += 1;
    }
  }

  const weights = edges.map((edge) => edge.weight);
  const maxEdges = directed
    ? nodes.length * Math.max(nodes.length - 1, 0)
    : (nodes.length * Math.max(nodes.length - 1, 0)) / 2;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const degreeRows = [...degreeMap.values()];

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    density: maxEdges === 0 ? 0 : edges.filter((edge) => edge.from !== edge.to).length / maxEdges,
    componentCount: nodes.length === 0 ? 0 : countWeakComponents(nodes, edges),
    isolatedNodes: degreeRows.filter((row) => row.totalDegree === 0).map((row) => row.id),
    hasCycle: directed ? hasDirectedCycle(nodes, edges) : hasUndirectedCycle(nodes, edges),
    hasNegativeWeight: edges.some((edge) => edge.weight < 0),
    minWeight: weights.length ? Math.min(...weights) : null,
    maxWeight: weights.length ? Math.max(...weights) : null,
    totalWeight,
    averageWeight: weights.length ? totalWeight / weights.length : null,
    topDegreeNodes: degreeRows
      .sort((a, b) => b.totalDegree - a.totalDegree || a.id.localeCompare(b.id))
      .slice(0, 5),
  };
}

export function findShortestPath(
  nodes: string[],
  edges: Edge[],
  directed: boolean,
  source: string,
  target: string
): ShortestPathResult {
  const empty = new Set<string>();
  if (!source || !target || !nodes.includes(source) || !nodes.includes(target)) {
    return { status: "missing-node", distance: null, path: [], edgeKeys: empty };
  }

  if (edges.some((edge) => edge.weight < 0)) {
    return { status: "negative-weight", distance: null, path: [], edgeKeys: empty };
  }

  const adjacency = buildAdjacency(nodes, edges, directed);
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const unvisited = new Set(nodes);

  for (const node of nodes) {
    distances.set(node, Number.POSITIVE_INFINITY);
    previous.set(node, null);
  }
  distances.set(source, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of unvisited) {
      const distance = distances.get(node) ?? Number.POSITIVE_INFINITY;
      if (distance < bestDistance) {
        bestDistance = distance;
        current = node;
      }
    }

    if (!current || bestDistance === Number.POSITIVE_INFINITY) {
      break;
    }

    unvisited.delete(current);
    if (current === target) {
      break;
    }

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!unvisited.has(neighbor.to)) continue;
      const nextDistance = bestDistance + neighbor.weight;
      if (nextDistance < (distances.get(neighbor.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.to, nextDistance);
        previous.set(neighbor.to, current);
      }
    }
  }

  const distance = distances.get(target) ?? Number.POSITIVE_INFINITY;
  if (distance === Number.POSITIVE_INFINITY) {
    return { status: "unreachable", distance: null, path: [], edgeKeys: empty };
  }

  const path: string[] = [];
  let cursor: string | null = target;
  while (cursor) {
    path.unshift(cursor);
    cursor = previous.get(cursor) ?? null;
  }

  const edgeKeys = new Set<string>();
  for (let index = 0; index < path.length - 1; index += 1) {
    edgeKeys.add(edgeKey(path[index], path[index + 1], directed));
  }

  return { status: "ready", distance, path, edgeKeys };
}

export function buildLayout(
  nodes: string[],
  width: number,
  height: number,
  mode: LayoutMode,
  edges: Edge[],
  directed: boolean,
  rootNode?: string
): PositionedNode[] {
  if (nodes.length === 0) {
    return [];
  }

  if (mode === "grid") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * (width / height))));
    const rows = Math.ceil(nodes.length / columns);
    const xGap = columns === 1 ? 0 : (width - 140) / (columns - 1);
    const yGap = rows === 1 ? 0 : (height - 120) / (rows - 1);

    return nodes.map((id, index) => ({
      id,
      x: columns === 1 ? width / 2 : 70 + (index % columns) * xGap,
      y: rows === 1 ? height / 2 : 60 + Math.floor(index / columns) * yGap,
    }));
  }

  if (mode === "flow") {
    const adjacency = buildAdjacency(nodes, edges, directed);
    const inDegree = new Map(nodes.map((node) => [node, 0]));
    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }

    const root =
      rootNode && nodes.includes(rootNode)
        ? rootNode
        : nodes.find((node) => (inDegree.get(node) ?? 0) === 0) ?? nodes[0];
    const rankMap = new Map<string, number>();
    const queue = [root];
    rankMap.set(root, 0);

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      const rank = rankMap.get(node) ?? 0;
      for (const neighbor of adjacency.get(node) ?? []) {
        if (!rankMap.has(neighbor.to)) {
          rankMap.set(neighbor.to, rank + 1);
          queue.push(neighbor.to);
        }
      }
    }

    for (const node of nodes) {
      if (!rankMap.has(node)) {
        rankMap.set(node, Math.max(0, ...rankMap.values()) + 1);
      }
    }

    const ranks = new Map<number, string[]>();
    for (const node of nodes) {
      const rank = rankMap.get(node) ?? 0;
      ranks.set(rank, [...(ranks.get(rank) ?? []), node]);
    }

    const orderedRanks = [...ranks.entries()].sort(([a], [b]) => a - b);
    const rankCount = orderedRanks.length;
    const result: PositionedNode[] = [];

    for (const [rankIndex, [, rankNodes]] of orderedRanks.entries()) {
      const x = rankCount === 1 ? width / 2 : 80 + (rankIndex * (width - 160)) / (rankCount - 1);
      for (const [nodeIndex, id] of rankNodes.entries()) {
        const y =
          rankNodes.length === 1
            ? height / 2
            : 60 + (nodeIndex * (height - 120)) / (rankNodes.length - 1);
        result.push({ id, x, y });
      }
    }

    return result;
  }

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(110, Math.min(width, height) * 0.34);

  return nodes.map((id, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1) - Math.PI / 2;
    return {
      id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

export function serializeGraph(format: ExportFormat, nodes: string[], edges: Edge[]) {
  if (format === "json") {
    return JSON.stringify({ nodes, edges }, null, 2);
  }

  return edges.map((edge) => `${edge.from},${edge.to},${edge.weight}`).join("\n");
}
