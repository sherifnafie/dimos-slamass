import React from "react";

import {
  buildViewport,
  clampZoom,
  panCamera,
  screenToWorld,
  worldToScreen,
  zoomCameraAtScreenPoint,
} from "./mapViewport";
import { MapState, Poi, RobotPose, UiCameraState, UiState } from "./types";

function useSize<T extends HTMLElement>(): [React.RefObject<T>, { width: number; height: number }] {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    if (!ref.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const box = entry.contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function isInsideMapFrame(
  screenX: number,
  screenY: number,
  imageLeft: number,
  imageTop: number,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return (
    screenX >= imageLeft &&
    screenX <= imageLeft + imageWidth &&
    screenY >= imageTop &&
    screenY <= imageTop + imageHeight
  );
}

function describeHighlightState(ui: UiState): string {
  if (ui.selected_poi_id) {
    return "Selected POI";
  }
  if (ui.highlighted_poi_ids.length > 1) {
    return `${ui.highlighted_poi_ids.length} highlights`;
  }
  if (ui.highlighted_poi_ids.length === 1) {
    return "1 highlight";
  }
  return "No highlights";
}

type MapPaneProps = {
  map: MapState | null;
  robotPose: RobotPose | null;
  path: Array<[number, number]>;
  pois: Poi[];
  ui: UiState;
  onCameraChange: (camera: UiCameraState) => void;
  onNavigate: (x: number, y: number) => void;
  onSelectPoi: (poiId: string | null) => void;
  onFocusPoi: (poiId: string) => void;
  onFocusMap: () => void;
  onFocusRobot: () => void;
  onClearFocus: () => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  startCamera: UiCameraState;
};

export function MapPane(props: MapPaneProps): React.ReactElement {
  const {
    map,
    robotPose,
    path,
    pois,
    ui,
    onCameraChange,
    onNavigate,
    onSelectPoi,
    onFocusPoi,
    onFocusMap,
    onFocusRobot,
    onClearFocus,
  } = props;
  const [containerRef, size] = useSize<HTMLDivElement>();
  const dragStateRef = React.useRef<DragState | null>(null);

  const viewport = React.useMemo(() => {
    if (!map || size.width <= 0 || size.height <= 0) {
      return null;
    }
    return buildViewport(map, size.width, size.height, ui.camera);
  }, [map, size.height, size.width, ui.camera]);

  const highlightedPoiIds = React.useMemo(
    () => new Set(ui.highlighted_poi_ids),
    [ui.highlighted_poi_ids],
  );
  const hasHighlights = highlightedPoiIds.size > 0;

  const stopEvent = React.useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const preventNativeDrag = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!map || !viewport || event.button !== 0) {
        return;
      }
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        startCamera: ui.camera,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [map, ui.camera, viewport],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!map || !viewport) {
        return;
      }
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(deltaX, deltaY) > 4) {
        dragState.moved = true;
      }
      if (!dragState.moved) {
        return;
      }
      onCameraChange(panCamera(map, dragState.startCamera, deltaX, deltaY, viewport));
    },
    [map, onCameraChange, viewport],
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!map || !viewport) {
        return;
      }
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);

      if (dragState.moved) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (
        !isInsideMapFrame(
          localX,
          localY,
          viewport.imageLeft,
          viewport.imageTop,
          viewport.imageWidth,
          viewport.imageHeight,
        )
      ) {
        return;
      }

      const [worldX, worldY] = screenToWorld(map, viewport, localX, localY);
      onSelectPoi(null);
      onNavigate(worldX, worldY);
    },
    [map, onNavigate, onSelectPoi, viewport],
  );

  const handlePointerCancel = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!map || !viewport) {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const zoomDelta = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = clampZoom(ui.camera.zoom * zoomDelta);
      if (nextZoom === ui.camera.zoom) {
        return;
      }
      onCameraChange(zoomCameraAtScreenPoint(map, ui.camera, localX, localY, nextZoom, viewport));
    },
    [map, onCameraChange, ui.camera, viewport],
  );

  return (
    <div
      className="map-surface"
      onDragStart={preventNativeDrag}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      ref={containerRef}
    >
      {!map || !viewport ? (
        <div className="panel-empty">
          <h3>SLAMASS map not ready</h3>
          <p>Start the Go2 stack and wait for the service to ingest raw costmap updates.</p>
        </div>
      ) : (
        <>
          <div className="map-chrome">
            <div className="map-meta">
              <span>Drag to pan</span>
              <span>Scroll to zoom</span>
              <span>{ui.camera.zoom.toFixed(2)}x</span>
              <span>{describeHighlightState(ui)}</span>
            </div>
            <div className="map-toolbar" onPointerDown={stopEvent}>
              <button className="map-tool" onClick={onFocusMap} type="button">
                Fit
              </button>
              <button
                className="map-tool"
                disabled={!robotPose}
                onClick={onFocusRobot}
                type="button"
              >
                Robot
              </button>
              <button
                className="map-tool"
                disabled={!ui.selected_poi_id}
                onClick={() => {
                  if (ui.selected_poi_id) {
                    onFocusPoi(ui.selected_poi_id);
                  }
                }}
                type="button"
              >
                Selected
              </button>
              <button
                className="map-tool"
                disabled={!ui.selected_poi_id && ui.highlighted_poi_ids.length === 0}
                onClick={onClearFocus}
                type="button"
              >
                Clear
              </button>
            </div>
          </div>

          <img
            alt="SLAMASS occupancy map"
            className="map-image"
            draggable={false}
            onDragStart={preventNativeDrag}
            src={map.image_url}
            style={{
              width: `${viewport.imageWidth}px`,
              height: `${viewport.imageHeight}px`,
              left: `${viewport.imageLeft}px`,
              top: `${viewport.imageTop}px`,
            }}
          />
          <svg className="map-overlay" viewBox={`0 0 ${size.width} ${size.height}`}>
            {path.length > 1 && (
              <polyline
                className="path-line"
                points={path
                  .map(([x, y]) => worldToScreen(map, viewport, x, y).join(","))
                  .join(" ")}
              />
            )}
            {robotPose && (() => {
              const [robotX, robotY] = worldToScreen(map, viewport, robotPose.x, robotPose.y);
              return (
                <g transform={`translate(${robotX}, ${robotY})`}>
                  <circle className="robot-ring" r="13" />
                  <circle className="robot-core" r="7" />
                  <line
                    className="robot-heading"
                    x1="0"
                    y1="0"
                    x2={Math.cos(robotPose.yaw) * 20}
                    y2={-Math.sin(robotPose.yaw) * 20}
                  />
                </g>
              );
            })()}
            {pois
              .filter((poi) => poi.status !== "deleted")
              .map((poi) => {
                const [x, y] = worldToScreen(map, viewport, poi.world_x, poi.world_y);
                const isSelected = poi.poi_id === ui.selected_poi_id;
                const isHighlighted = highlightedPoiIds.has(poi.poi_id);
                const coneLength = isSelected ? 58 : isHighlighted ? 46 : 0;
                const coneSpread = isSelected ? 0.34 : 0.24;
                return (
                  <g key={`${poi.poi_id}-overlay`}>
                    {coneLength > 0 && (
                      <path
                        className={`poi-view-cone ${isSelected ? "is-selected" : "is-highlighted"}`}
                        d={[
                          `M ${x} ${y}`,
                          `L ${x + Math.cos(poi.world_yaw - coneSpread) * coneLength} ${
                            y - Math.sin(poi.world_yaw - coneSpread) * coneLength
                          }`,
                          `A ${coneLength} ${coneLength} 0 0 1 ${x + Math.cos(poi.world_yaw + coneSpread) * coneLength} ${
                            y - Math.sin(poi.world_yaw + coneSpread) * coneLength
                          }`,
                          "Z",
                        ].join(" ")}
                      />
                    )}
                    <line
                      className="poi-heading"
                      x1={x}
                      y1={y}
                      x2={x + Math.cos(poi.world_yaw) * 16}
                      y2={y - Math.sin(poi.world_yaw) * 16}
                    />
                    <line
                      className="poi-tether"
                      x1={x}
                      y1={y}
                      x2={x}
                      y2={y - 36}
                    />
                    {(isSelected || isHighlighted) && (
                      <circle
                        className={`poi-anchor-halo ${isSelected ? "is-selected" : "is-highlighted"}`}
                        cx={x}
                        cy={y}
                        r={isSelected ? 10 : 8}
                      />
                    )}
                  </g>
                );
              })}
          </svg>
          {pois
            .filter((poi) => poi.status !== "deleted")
            .map((poi) => {
              const [x, y] = worldToScreen(map, viewport, poi.world_x, poi.world_y);
              const isSelected = poi.poi_id === ui.selected_poi_id;
              const isHighlighted = highlightedPoiIds.has(poi.poi_id);
              const isMuted = hasHighlights && !isHighlighted && !isSelected;
              return (
                <button
                  className={[
                    "poi-card",
                    isSelected ? "is-selected" : "",
                    isHighlighted ? "is-highlighted" : "",
                    isMuted ? "is-muted" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={poi.poi_id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectPoi(poi.poi_id);
                  }}
                  onDragStart={preventNativeDrag}
                  onPointerDown={stopEvent}
                  style={{ left: `${x}px`, top: `${y - 42}px` }}
                  type="button"
                >
                  <img alt={poi.title} draggable={false} onDragStart={preventNativeDrag} src={poi.thumbnail_url} />
                  <span>{poi.title}</span>
                </button>
              );
            })}
        </>
      )}
    </div>
  );
}
