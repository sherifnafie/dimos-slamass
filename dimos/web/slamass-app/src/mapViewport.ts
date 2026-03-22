import type { AppState, MapState, UiCameraState } from "./types";

/** Below 1 shows more map (zoomed out); above 1 magnifies. */
export const MIN_MAP_ZOOM = 0.25;
export const MAX_MAP_ZOOM = 4;
/**
 * Overview zoom after fit (centered on map). zoom=1 touches the shorter view axis; lower = more margin.
 * Must stay aligned with `UI_DEFAULT_MAP_ZOOM` in `dimos/slamass/service.py`.
 */
export const DEFAULT_MAP_ZOOM = 0.78;

export type MapViewport = {
  width: number;
  height: number;
  pixelsPerCell: number;
  centerCellX: number;
  centerCellY: number;
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
};

export function clampZoom(zoom: number): number {
  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, zoom));
}

export function getMapCenter(map: MapState): [number, number] {
  return [
    map.origin_x + (map.width * map.resolution) / 2,
    map.origin_y + (map.height * map.resolution) / 2,
  ];
}

/** Same framing as POST /api/ui/focus-map: map center + overview zoom. */
export function fitOverviewCamera(map: MapState): UiCameraState {
  const [cx, cy] = getMapCenter(map);
  return normalizeCamera(map, {
    center_x: cx,
    center_y: cy,
    zoom: DEFAULT_MAP_ZOOM,
  });
}

export function applyFitOverviewCameraToAppState(state: AppState): AppState {
  if (!state.map) {
    return state;
  }
  return {
    ...state,
    ui: {
      ...state.ui,
      camera: fitOverviewCamera(state.map),
    },
  };
}

export function normalizeCamera(map: MapState, camera: UiCameraState): UiCameraState {
  const [defaultCenterX, defaultCenterY] = getMapCenter(map);
  const minX = map.origin_x;
  const maxX = map.origin_x + map.width * map.resolution;
  const minY = map.origin_y;
  const maxY = map.origin_y + map.height * map.resolution;

  const centerX = camera.center_x ?? defaultCenterX;
  const centerY = camera.center_y ?? defaultCenterY;

  return {
    center_x: Math.min(Math.max(centerX, minX), maxX),
    center_y: Math.min(Math.max(centerY, minY), maxY),
    zoom: clampZoom(camera.zoom),
  };
}

export function buildViewport(
  map: MapState,
  width: number,
  height: number,
  camera: UiCameraState,
): MapViewport {
  const normalizedCamera = normalizeCamera(map, camera);
  const basePixelsPerCell = Math.min(width / map.width, height / map.height);
  const pixelsPerCell = basePixelsPerCell * normalizedCamera.zoom;
  const centerCellX = (normalizedCamera.center_x! - map.origin_x) / map.resolution;
  const centerCellY = (normalizedCamera.center_y! - map.origin_y) / map.resolution;
  const imageWidth = map.width * pixelsPerCell;
  const imageHeight = map.height * pixelsPerCell;

  return {
    width,
    height,
    pixelsPerCell,
    centerCellX,
    centerCellY,
    imageLeft: width / 2 - centerCellX * pixelsPerCell,
    imageTop: height / 2 - (map.height - centerCellY) * pixelsPerCell,
    imageWidth,
    imageHeight,
  };
}

export function worldToScreen(
  map: MapState,
  viewport: MapViewport,
  x: number,
  y: number,
): [number, number] {
  const cellX = (x - map.origin_x) / map.resolution;
  const cellY = (y - map.origin_y) / map.resolution;
  const imageX = cellX * viewport.pixelsPerCell;
  const imageY = (map.height - cellY) * viewport.pixelsPerCell;
  return [viewport.imageLeft + imageX, viewport.imageTop + imageY];
}

export function worldToImagePixels(
  map: MapState,
  viewport: MapViewport,
  x: number,
  y: number,
): [number, number] {
  const cellX = (x - map.origin_x) / map.resolution;
  const cellY = (y - map.origin_y) / map.resolution;
  return [
    cellX * viewport.pixelsPerCell,
    (map.height - cellY) * viewport.pixelsPerCell,
  ];
}

export function screenToWorld(
  map: MapState,
  viewport: MapViewport,
  screenX: number,
  screenY: number,
): [number, number] {
  const cellX = (screenX - viewport.imageLeft) / viewport.pixelsPerCell;
  const cellY = map.height - (screenY - viewport.imageTop) / viewport.pixelsPerCell;
  return [
    map.origin_x + cellX * map.resolution,
    map.origin_y + cellY * map.resolution,
  ];
}

export function panCamera(
  map: MapState,
  camera: UiCameraState,
  deltaX: number,
  deltaY: number,
  viewport: MapViewport,
): UiCameraState {
  const normalized = normalizeCamera(map, camera);
  const deltaWorldX = (-deltaX / viewport.pixelsPerCell) * map.resolution;
  const deltaWorldY = (deltaY / viewport.pixelsPerCell) * map.resolution;
  return normalizeCamera(map, {
    center_x: normalized.center_x! + deltaWorldX,
    center_y: normalized.center_y! + deltaWorldY,
    zoom: normalized.zoom,
  });
}

export function zoomCameraAtScreenPoint(
  map: MapState,
  camera: UiCameraState,
  screenX: number,
  screenY: number,
  nextZoom: number,
  viewport: MapViewport,
): UiCameraState {
  const clampedZoom = clampZoom(nextZoom);
  const [worldX, worldY] = screenToWorld(map, viewport, screenX, screenY);
  const cellX = (worldX - map.origin_x) / map.resolution;
  const cellY = (worldY - map.origin_y) / map.resolution;
  const basePixelsPerCell = Math.min(viewport.width / map.width, viewport.height / map.height);
  const pixelsPerCell = basePixelsPerCell * clampedZoom;
  const centerCellX = cellX - (screenX - viewport.width / 2) / pixelsPerCell;
  const centerCellY = cellY + (screenY - viewport.height / 2) / pixelsPerCell;

  return normalizeCamera(map, {
    center_x: map.origin_x + centerCellX * map.resolution,
    center_y: map.origin_y + centerCellY * map.resolution,
    zoom: clampedZoom,
  });
}
