export type GraphPoint = {
  x: number;
  y: number;
};

export type GraphViewport = GraphPoint & {
  scale: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export const GRAPH_WIDTH = 960;
export const GRAPH_HEIGHT = 560;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function defaultGraphViewport(): GraphViewport {
  return { x: 0, y: 0, scale: 1 };
}

export function clampGraphScale(scale: number) {
  return clamp(scale, MIN_ZOOM, MAX_ZOOM);
}

export function clampGraphViewport(viewport: GraphViewport): GraphViewport {
  const scale = clampGraphScale(viewport.scale);
  const visibleWidth = GRAPH_WIDTH / scale;
  const visibleHeight = GRAPH_HEIGHT / scale;
  const maxX = GRAPH_WIDTH - visibleWidth;
  const maxY = GRAPH_HEIGHT - visibleHeight;

  return {
    x: maxX <= 0 ? maxX / 2 : clamp(viewport.x, 0, maxX),
    y: maxY <= 0 ? maxY / 2 : clamp(viewport.y, 0, maxY),
    scale,
  };
}

export function getViewportCenter(viewport: GraphViewport): GraphPoint {
  return {
    x: viewport.x + GRAPH_WIDTH / viewport.scale / 2,
    y: viewport.y + GRAPH_HEIGHT / viewport.scale / 2,
  };
}

export function getNextZoomScale(currentScale: number, direction: -1 | 1) {
  return clampGraphScale(currentScale + direction * ZOOM_STEP);
}

export function zoomGraphViewport(
  viewport: GraphViewport,
  nextScale: number,
  focalPoint: GraphPoint
): GraphViewport {
  const scale = clampGraphScale(nextScale);
  const ratio = viewport.scale / scale;

  return clampGraphViewport({
    x: focalPoint.x - (focalPoint.x - viewport.x) * ratio,
    y: focalPoint.y - (focalPoint.y - viewport.y) * ratio,
    scale,
  });
}

export function panGraphViewport(
  viewport: GraphViewport,
  delta: GraphPoint,
  viewportSize: ViewportSize
): GraphViewport {
  const visibleWidth = GRAPH_WIDTH / viewport.scale;
  const visibleHeight = GRAPH_HEIGHT / viewport.scale;

  return clampGraphViewport({
    ...viewport,
    x: viewport.x - delta.x * (visibleWidth / viewportSize.width),
    y: viewport.y - delta.y * (visibleHeight / viewportSize.height),
  });
}
