import { describe, expect, it } from "vitest";
import {
  analyzeGraph,
  buildLayout,
  detectGraphFormat,
  detectGraphFormatFromFileName,
  findShortestPath,
  parseGraph,
  serializeGraph,
} from "./graphLogic";

describe("parseGraph", () => {
  it("parses comma and whitespace edge lists", () => {
    const result = parseGraph("from,to,weight\nA,B,5\nB C 2\nC,D", "edge-list");

    expect(result.error).toBeUndefined();
    expect(result.nodes).toEqual(["A", "B", "C", "D"]);
    expect(result.edges).toEqual([
      { from: "A", to: "B", weight: 5 },
      { from: "B", to: "C", weight: 2 },
      { from: "C", to: "D", weight: 1 },
    ]);
  });

  it("parses adjacency lists with optional weights", () => {
    const result = parseGraph("A: B(5), C:2, D\nD:", "adjacency-list");

    expect(result.error).toBeUndefined();
    expect(result.nodes).toEqual(["A", "B", "C", "D"]);
    expect(result.edges).toEqual([
      { from: "A", to: "B", weight: 5 },
      { from: "A", to: "C", weight: 2 },
      { from: "A", to: "D", weight: 1 },
    ]);
  });

  it("parses labeled adjacency matrices", () => {
    const result = parseGraph(",A,B,C\nA,0,3,0\nB,0,0,4\nC,2,0,0", "matrix");

    expect(result.error).toBeUndefined();
    expect(result.nodes).toEqual(["A", "B", "C"]);
    expect(result.edges).toEqual([
      { from: "A", to: "B", weight: 3 },
      { from: "B", to: "C", weight: 4 },
      { from: "C", to: "A", weight: 2 },
    ]);
  });

  it("parses JSON graph objects and aliases", () => {
    const result = parseGraph(
      JSON.stringify({
        nodes: [{ id: "S" }, "T"],
        links: [{ source: "S", target: "T", value: 8 }],
      }),
      "json"
    );

    expect(result.error).toBeUndefined();
    expect(result.nodes).toEqual(["S", "T"]);
    expect(result.edges).toEqual([{ from: "S", to: "T", weight: 8 }]);
  });

  it("parses LeetCode style n and edges arrays", () => {
    const result = parseGraph("n -> 4\nedges -> [[2,1,1],[2,3,1],[3,4,1]]", "leetcode");

    expect(result.error).toBeUndefined();
    expect(result.nodes).toEqual(["1", "2", "3", "4"]);
    expect(result.edges).toEqual([
      { from: "2", to: "1", weight: 1 },
      { from: "2", to: "3", weight: 1 },
      { from: "3", to: "4", weight: 1 },
    ]);
  });

  it("detects plain LeetCode edge arrays", () => {
    expect(detectGraphFormat("[[2,1,1],[2,3,1],[3,4,1]]")).toBe("leetcode");
  });

  it("returns friendly errors for invalid matrix shapes", () => {
    const result = parseGraph(",A,B\nA,0\nB,1,0", "matrix");

    expect(result.error).toContain("does not match");
  });
});

describe("format detection", () => {
  it("detects common pasted graph formats", () => {
    expect(detectGraphFormat('{"nodes":["A"],"edges":[]}')).toBe("json");
    expect(detectGraphFormat("A: B(2), C")).toBe("adjacency-list");
    expect(detectGraphFormat(",A,B\nA,0,1\nB,0,0")).toBe("matrix");
    expect(detectGraphFormat("A,B,5\nB,C,2")).toBe("edge-list");
  });

  it("uses file extensions when they are explicit", () => {
    expect(detectGraphFormatFromFileName("graph.json", "A,B,1")).toBe("json");
    expect(detectGraphFormatFromFileName("graph.matrix", "A,B,1")).toBe("matrix");
    expect(detectGraphFormatFromFileName("graph.adj", "A,B,1")).toBe("adjacency-list");
  });
});

describe("graph analysis", () => {
  it("summarizes connectivity, cycles, and degree leaders", () => {
    const graph = parseGraph("A,B,1\nB,C,1\nC,A,1\nD,E,1", "edge-list");
    const analysis = analyzeGraph(graph.nodes, graph.edges, true);

    expect(analysis.componentCount).toBe(2);
    expect(analysis.hasCycle).toBe(true);
    expect(analysis.topDegreeNodes[0].totalDegree).toBe(2);
  });

  it("finds weighted shortest paths", () => {
    const graph = parseGraph("S,A,1\nS,B,10\nA,B,2\nB,T,3\nA,T,20", "edge-list");
    const path = findShortestPath(graph.nodes, graph.edges, true, "S", "T");

    expect(path.status).toBe("ready");
    expect(path.distance).toBe(6);
    expect(path.path).toEqual(["S", "A", "B", "T"]);
  });

  it("blocks shortest paths when negative weights are present", () => {
    const graph = parseGraph("A,B,-1", "edge-list");
    const path = findShortestPath(graph.nodes, graph.edges, true, "A", "B");

    expect(path.status).toBe("negative-weight");
  });

  it("serializes rendered graphs for export", () => {
    const graph = parseGraph("A,B,5", "edge-list");

    expect(serializeGraph("edge-list", graph.nodes, graph.edges)).toBe("A,B,5");
    expect(JSON.parse(serializeGraph("json", graph.nodes, graph.edges))).toEqual({
      nodes: ["A", "B"],
      edges: [{ from: "A", to: "B", weight: 5 }],
    });
  });
});

describe("graph layouts", () => {
  it("keeps flow positions stable unless an explicit root is provided", () => {
    const graph = parseGraph("S,A,1\nS,B,1\nA,C,1\nB,C,1", "edge-list");
    const naturalLayout = buildLayout(graph.nodes, 960, 560, "flow", graph.edges, true);
    const explicitRootLayout = buildLayout(graph.nodes, 960, 560, "flow", graph.edges, true, "C");

    expect(naturalLayout.find((node) => node.id === "S")?.x).toBeLessThan(
      naturalLayout.find((node) => node.id === "C")?.x ?? 0
    );
    expect(explicitRootLayout.find((node) => node.id === "C")?.x).toBeLessThan(
      explicitRootLayout.find((node) => node.id === "S")?.x ?? 0
    );
  });
});
