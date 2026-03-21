import React from "react";

import go2TopdownSprite from "./assets/go2-topdown.png";
import {
  buildViewport,
  panCamera,
  screenToWorld,
  worldToImagePixels,
} from "./mapViewport";
import { refFromPoi, refFromYoloObject, semanticKey } from "./semanticItems";
import {
  LayerVisibility,
  MapState,
  Poi,
  RobotPose,
  SemanticItemRef,
  UiCameraState,
  UiState,
  YoloObject,
} from "./types";

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
  if (ui.selected_item) {
    return "Selected";
  }
  if (ui.highlighted_items.length > 1) {
    return `${ui.highlighted_items.length} highlights`;
  }
  if (ui.highlighted_items.length === 1) {
    return "1 highlight";
  }
  return "No highlights";
}

function yoloLabelVisibility(zoom: number): "none" | "priority" | "all" {
  if (zoom < 1.25) {
    return "none";
  }
  if (zoom < 2) {
    return "priority";
  }
  return "all";
}

type MapPaneProps = {
  map: MapState | null;
  robotPose: RobotPose | null;
  path: Array<[number, number]>;
  pois: Poi[];
  yoloObjects: YoloObject[];
  layers: LayerVisibility;
  ui: UiState;
  onCameraChange: (camera: UiCameraState) => void;
  onNavigate: (x: number, y: number) => void;
  onSelectItem: (item: SemanticItemRef | null) => void;
  onFocusItem: (item: SemanticItemRef) => void;
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

const ROBOT_SPRITE_SIZE = 44;

export function MapPane(props: MapPaneProps): React.ReactElement {
  const {
    map,
    robotPose,
    path,
    pois,
    yoloObjects,
    layers,
    ui,
    onCameraChange,
    onNavigate,
    onSelectItem,
    onFocusItem,
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

  const selectedKey = semanticKey(ui.selected_item);
  const highlightedKeys = React.useMemo(
    () => new Set(ui.highlighted_items.map((item) => semanticKey(item))),
    [ui.highlighted_items],
  );
  const hasHighlights = highlightedKeys.size > 0;

  const activePois = React.useMemo(
    () => pois.filter((poi) => poi.status !== "deleted"),
    [pois],
  );

  const activeYoloObjects = React.useMemo(
    () => yoloObjects.filter((object) => object.status !== "deleted"),
    [yoloObjects],
  );

  const labelVisibility = yoloLabelVisibility(ui.camera.zoom);
  const labeledYoloIds = React.useMemo(() => {
    if (labelVisibility === "none") {
      return new Set<string>();
    }
    const sorted = activeYoloObjects
      .slice()
      .sort((left, right) => {
        if (right.updated_at !== left.updated_at) {
          return right.updated_at.localeCompare(left.updated_at);
        }
        return right.best_confidence - left.best_confidence;
      })
      .map((object) => object.object_id);

    if (labelVisibility === "all") {
      return new Set(sorted);
    }
    return new Set(sorted.slice(0, 18));
  }, [activeYoloObjects, labelVisibility]);

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
      onSelectItem(null);
      onNavigate(worldX, worldY);
    },
    [map, onNavigate, onSelectItem, viewport],
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

  return (
    <div
      className="map-surface"
      onDragStart={preventNativeDrag}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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
              <span>Pan map</span>
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
                disabled={!ui.selected_item}
                onClick={() => {
                  if (ui.selected_item) {
                    onFocusItem(ui.selected_item);
                  }
                }}
                type="button"
              >
                Selected
              </button>
              <button
                className="map-tool"
                disabled={!ui.selected_item && ui.highlighted_items.length === 0}
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
          <svg
            className="map-overlay map-overlay-anchored"
            preserveAspectRatio="none"
            style={{
              width: `${viewport.imageWidth}px`,
              height: `${viewport.imageHeight}px`,
              left: `${viewport.imageLeft}px`,
              top: `${viewport.imageTop}px`,
            }}
            viewBox={`0 0 ${viewport.imageWidth} ${viewport.imageHeight}`}
          >
            {path.length > 1 && (
              <polyline
                className="path-line"
                points={path
                  .map(([x, y]) => worldToImagePixels(map, viewport, x, y).join(","))
                  .join(" ")}
              />
            )}
            {layers.show_pois &&
              activePois.map((poi) => {
                const [x, y] = worldToImagePixels(map, viewport, poi.world_x, poi.world_y);
                const itemRef = refFromPoi(poi.poi_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const isHighlighted = highlightedKeys.has(itemKey);
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
            {layers.show_yolo &&
              activeYoloObjects.map((object) => {
                const [x, y] = worldToImagePixels(map, viewport, object.world_x, object.world_y);
                const itemRef = refFromYoloObject(object.object_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const isHighlighted = highlightedKeys.has(itemKey);
                return (
                  <g key={`${object.object_id}-marker`}>
                    <circle
                      className={`yolo-ring ${isSelected ? "is-selected" : isHighlighted ? "is-highlighted" : ""}`}
                      cx={x}
                      cy={y}
                      r={isSelected ? 11 : 9}
                    />
                    {(isSelected || isHighlighted) && (
                      <circle
                        className={`yolo-halo ${isSelected ? "is-selected" : "is-highlighted"}`}
                        cx={x}
                        cy={y}
                        r={isSelected ? 14 : 12}
                      />
                    )}
                    <circle
                      className={`yolo-dot ${isSelected ? "is-selected" : isHighlighted ? "is-highlighted" : ""}`}
                      cx={x}
                      cy={y}
                      r={isSelected ? 6.5 : 5}
                    />
                  </g>
                );
              })}
          </svg>
          <div
            className="map-annotation-layer"
            style={{
              width: `${viewport.imageWidth}px`,
              height: `${viewport.imageHeight}px`,
              left: `${viewport.imageLeft}px`,
              top: `${viewport.imageTop}px`,
            }}
          >
            {robotPose && (() => {
              const [robotX, robotY] = worldToImagePixels(map, viewport, robotPose.x, robotPose.y);
              const robotRotationDegrees = -((robotPose.yaw * 180) / Math.PI) - 90;
              return (
                <div
                  aria-hidden="true"
                  className="robot-marker"
                  style={{
                    left: `${robotX}px`,
                    top: `${robotY}px`,
                    transform: `translate(-50%, -50%) rotate(${robotRotationDegrees}deg)`,
                  }}
                >
                  <img alt="" className="robot-marker-image" src={go2TopdownSprite} />
                </div>
              );
            })()}
            {layers.show_pois &&
              activePois.map((poi) => {
                const [x, y] = worldToImagePixels(map, viewport, poi.world_x, poi.world_y);
                const itemRef = refFromPoi(poi.poi_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const isHighlighted = highlightedKeys.has(itemKey);
                const isMuted = hasHighlights && !isHighlighted && !isSelected;
                return (
                  <button
                    className={[
                      "poi-pin",
                      isSelected ? "is-selected" : "",
                      isHighlighted ? "is-highlighted" : "",
                      isMuted ? "is-muted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={`POI ${poi.title}`}
                    key={poi.poi_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectItem(itemRef);
                    }}
                    onDragStart={preventNativeDrag}
                    onPointerDown={stopEvent}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    title={poi.title}
                    type="button"
                  >
                    <img
                      alt={poi.title}
                      draggable={false}
                      onDragStart={preventNativeDrag}
                      src={poi.thumbnail_url}
                    />
                    <span className="poi-pin-label">{poi.title}</span>
                  </button>
                );
              })}
            {layers.show_yolo &&
              activeYoloObjects.map((object) => {
                const [x, y] = worldToImagePixels(map, viewport, object.world_x, object.world_y);
                const itemRef = refFromYoloObject(object.object_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const isHighlighted = highlightedKeys.has(itemKey);
                const isMuted = hasHighlights && !isHighlighted && !isSelected;
                const showLabel = isSelected || isHighlighted || labeledYoloIds.has(object.object_id);
                return (
                  <button
                    className={[
                      "yolo-chip",
                      showLabel ? "has-label" : "dot-only",
                      isSelected ? "is-selected" : "",
                      isHighlighted ? "is-highlighted" : "",
                      isMuted ? "is-muted" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-label={`YOLO ${object.label}`}
                    key={object.object_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectItem(itemRef);
                    }}
                    onDragStart={preventNativeDrag}
                    onPointerDown={stopEvent}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    title={`${object.label} ${Math.round(object.best_confidence * 100)}%`}
                    type="button"
                  >
                    {showLabel ? <span>{object.label}</span> : <span className="sr-only">{object.label}</span>}
                  </button>
                );
              })}
          </div>
          <div className="map-legend" onPointerDown={stopEvent}>
            <span>
              <i className="legend-swatch robot" />
              Robot
            </span>
            <span>
              <i className="legend-swatch path" />
              Planned path
            </span>
            <span>
              <i className="legend-swatch poi" />
              VLM anchors
            </span>
            <span>
              <i className="legend-swatch yolo" />
              YOLO objects
            </span>
          </div>
        </>
      )}
    </div>
  );
}
