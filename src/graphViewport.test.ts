import { describe, expect, it } from "vitest";
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  clampGraphViewport,
  defaultGraphViewport,
  getNextZoomScale,
  getViewportCenter,
  panGraphViewport,
  zoomGraphViewport,
} from "./graphViewport";

describe("graph viewport", () => {
  it("uses the full graph as the default fitted viewport", () => {
    expect(defaultGraphViewport()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("clamps panned viewports inside the graph at zoomed-in scales", () => {
    expect(clampGraphViewport({ x: -200, y: 999, scale: 2 })).toEqual({
      x: 0,
      y: GRAPH_HEIGHT / 2,
      scale: 2,
    });
  });

  it("centers the graph when zoomed out below the fitted scale", () => {
    expect(clampGraphViewport({ x: 100, y: 100, scale: MIN_ZOOM })).toEqual({
      x: -GRAPH_WIDTH / 2,
      y: -GRAPH_HEIGHT / 2,
      scale: MIN_ZOOM,
    });
  });

  it("zooms around a focal point", () => {
    const zoomed = zoomGraphViewport(defaultGraphViewport(), 2, {
      x: GRAPH_WIDTH / 2,
      y: GRAPH_HEIGHT / 2,
    });

    expect(zoomed).toEqual({ x: GRAPH_WIDTH / 4, y: GRAPH_HEIGHT / 4, scale: 2 });
    expect(getViewportCenter(zoomed)).toEqual({ x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 });
  });

  it("steps zoom within the configured bounds", () => {
    expect(getNextZoomScale(1, 1)).toBe(1.25);
    expect(getNextZoomScale(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(getNextZoomScale(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it("pans in graph-coordinate units and clamps at graph edges", () => {
    const viewport = { x: 240, y: 140, scale: 2 };
    expect(panGraphViewport(viewport, { x: 100, y: 50 }, { width: 960, height: 560 })).toEqual({
      x: 190,
      y: 115,
      scale: 2,
    });

    expect(panGraphViewport(viewport, { x: -2000, y: -2000 }, { width: 960, height: 560 })).toEqual({
      x: GRAPH_WIDTH / 2,
      y: GRAPH_HEIGHT / 2,
      scale: 2,
    });
  });
});
