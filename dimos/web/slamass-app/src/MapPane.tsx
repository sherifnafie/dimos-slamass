import React from "react";

import {
  buildViewport,
  clampZoom,
  screenToWorld,
  worldToImagePixels,
  zoomCameraAtScreenPoint,
} from "./mapViewport";
import { refFromPoi, refFromYoloObject, semanticKey } from "./semanticItems";
import type { RobotOperatorHoverCard } from "./robotOperatorLabel";
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
    const el = ref.current;
    const apply = (width: number, height: number) => {
      setSize({ width, height });
    };
    const measure = () => {
      const rect = el.getBoundingClientRect();
      apply(rect.width, rect.height);
    };
    measure();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const box = entry.contentRect;
      apply(box.width, box.height);
    });
    observer.observe(el);
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
  /** Compact operator-style hover card on the robot marker. */
  robotOperatorHoverCard: RobotOperatorHoverCard;
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
  /** When set, show a 2D / 3D switcher (perspective tilt in 3D; tap-to-navigate only in 2D). */
  showViewModeToggle?: boolean;
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
    robotOperatorHoverCard,
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
    showViewModeToggle = false,
  } = props;
  const [containerRef, size] = useSize<HTMLDivElement>();
  const [mapViewMode, setMapViewMode] = React.useState<"2d" | "3d">("2d");
  const dragStateRef = React.useRef<DragState | null>(null);
  const cameraRef = React.useRef(ui.camera);

  React.useEffect(() => {
    cameraRef.current = ui.camera;
  }, [ui.camera]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !map) {
      return undefined;
    }

    const onWheel = (event: WheelEvent): void => {
      const rect = el.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        return;
      }
      event.preventDefault();
      const cam = cameraRef.current;
      const viewportNow = buildViewport(map, width, height, cam);
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const nextZoom = clampZoom(cam.zoom * factor);
      if (Math.abs(nextZoom - cam.zoom) < 1e-6) {
        return;
      }
      onCameraChange(
        zoomCameraAtScreenPoint(map, cam, localX, localY, nextZoom, viewportNow),
      );
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [map, onCameraChange]);

  const viewport = React.useMemo(() => {
    if (!map || size.width <= 0 || size.height <= 0) {
      return null;
    }
    return buildViewport(map, size.width, size.height, ui.camera);
  }, [map, size.height, size.width, ui.camera]);

  const selectedKey = semanticKey(ui.selected_item);

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
    },
    [map, viewport],
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

      if (showViewModeToggle && mapViewMode === "3d") {
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
    [map, mapViewMode, onNavigate, onSelectItem, showViewModeToggle, viewport],
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
          <h3>Navigator map not ready</h3>
          <p>Start the Go2 stack and wait for the service to ingest raw costmap updates.</p>
        </div>
      ) : (
        <>
          <div className="map-chrome">
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
              {showViewModeToggle ? (
                <div
                  aria-label="Map view mode"
                  className="map-view-mode-switch"
                  role="group"
                >
                  <button
                    className={mapViewMode === "2d" ? "is-active" : undefined}
                    onClick={() => {
                      setMapViewMode("2d");
                    }}
                    type="button"
                  >
                    2D
                  </button>
                  <button
                    className={mapViewMode === "3d" ? "is-active" : undefined}
                    onClick={() => {
                      setMapViewMode("3d");
                    }}
                    type="button"
                  >
                    3D
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={[
              "map-visual-3d-wrap",
              showViewModeToggle && mapViewMode === "3d" ? "map-visual-3d-wrap--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <img
                alt="Navigator occupancy map"
                className="map-image"
                draggable={false}
                onDragStart={preventNativeDrag}
                src={map.image_url}
                style={{
                  width: `${viewport.imageWidth}px`,
                  height: `${viewport.imageHeight}px`,
                  left: `${Math.round(viewport.imageLeft)}px`,
                  top: `${Math.round(viewport.imageTop)}px`,
                }}
              />
              <svg
                className="map-overlay map-overlay-anchored"
                preserveAspectRatio="none"
                style={{
                  width: `${viewport.imageWidth}px`,
                  height: `${viewport.imageHeight}px`,
                  left: `${Math.round(viewport.imageLeft)}px`,
                  top: `${Math.round(viewport.imageTop)}px`,
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
                const [anchorX, anchorY] = worldToImagePixels(
                  map,
                  viewport,
                  poi.anchor_x,
                  poi.anchor_y,
                );
                const itemRef = refFromPoi(poi.poi_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const coneLength = isSelected ? 58 : 0;
                const coneSpread = 0.34;
                return (
                  <g key={`${poi.poi_id}-overlay`}>
                    {coneLength > 0 && (
                      <path
                        className={isSelected ? "poi-view-cone is-selected" : "poi-view-cone"}
                        d={[
                          `M ${anchorX} ${anchorY}`,
                          `L ${anchorX + Math.cos(poi.anchor_yaw - coneSpread) * coneLength} ${
                            anchorY - Math.sin(poi.anchor_yaw - coneSpread) * coneLength
                          }`,
                          `A ${coneLength} ${coneLength} 0 0 1 ${
                            anchorX + Math.cos(poi.anchor_yaw + coneSpread) * coneLength
                          } ${
                            anchorY - Math.sin(poi.anchor_yaw + coneSpread) * coneLength
                          }`,
                          "Z",
                        ].join(" ")}
                      />
                    )}
                    <line
                      className="poi-heading"
                      x1={anchorX}
                      y1={anchorY}
                      x2={anchorX + Math.cos(poi.anchor_yaw) * 16}
                      y2={anchorY - Math.sin(poi.anchor_yaw) * 16}
                    />
                    {isSelected && (
                      <circle
                        className="poi-anchor-halo is-selected"
                        cx={anchorX}
                        cy={anchorY}
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
                return (
                  <g key={`${object.object_id}-marker`}>
                    <circle
                      className={`yolo-ring ${isSelected ? "is-selected" : ""}`}
                      cx={x}
                      cy={y}
                      r={isSelected ? 11 : 9}
                    />
                    {isSelected && (
                      <circle
                        className="yolo-halo is-selected"
                        cx={x}
                        cy={y}
                        r={14}
                      />
                    )}
                    <circle
                      className={`yolo-dot ${isSelected ? "is-selected" : ""}`}
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
              left: `${Math.round(viewport.imageLeft)}px`,
              top: `${Math.round(viewport.imageTop)}px`,
            }}
          >
            {robotPose && (() => {
              const [robotX, robotY] = worldToImagePixels(map, viewport, robotPose.x, robotPose.y);
              const card = robotOperatorHoverCard;
              const statusLabel =
                card.active === "blue"
                  ? "Standby"
                  : card.active === "grey"
                    ? "Inactive"
                    : card.active === "green"
                      ? "Active"
                      : undefined;
              return (
                <div
                  aria-describedby="map-robot-operator-gamecard"
                  aria-label={`Robot — ${card.instanceName}`}
                  className="robot-marker"
                  onPointerDown={stopEvent}
                  style={{
                    left: `${robotX}px`,
                    top: `${robotY}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  tabIndex={0}
                >
                  <span className="robot-marker-pulse-ring robot-marker-pulse-ring--1" />
                  <span className="robot-marker-pulse-ring robot-marker-pulse-ring--2" />
                  <div className="robot-marker-disc" />
                  <div
                    className="robot-marker-gamecard"
                    id="map-robot-operator-gamecard"
                    role="tooltip"
                  >
                    <div className="robot-marker-gamecard-media">
                      <img
                        alt={card.imageAlt}
                        className="robot-marker-gamecard-img"
                        decoding="async"
                        draggable={false}
                        src={card.imageUrl}
                      />
                    </div>
                    <div className="robot-marker-gamecard-body">
                      <div className="robot-marker-gamecard-title-row">
                        <span className="robot-marker-gamecard-title">
                          {card.instanceName}
                        </span>
                        {card.active ? (
                          <span
                            aria-label={statusLabel}
                            className="robot-marker-gamecard-status"
                            role="status"
                          >
                            <span
                              aria-hidden
                              className={`robot-marker-gamecard-dot robot-marker-gamecard-dot--${card.active}`}
                            />
                          </span>
                        ) : null}
                      </div>
                      {card.modelTitle ? (
                        <p className="robot-marker-gamecard-model">{card.modelTitle}</p>
                      ) : null}
                      {card.typeLine ? (
                        <p className="robot-marker-gamecard-meta">
                          <span className="robot-marker-gamecard-meta-label">Type</span>{" "}
                          <span className="robot-marker-gamecard-meta-value">
                            {card.typeLine}
                          </span>
                        </p>
                      ) : null}
                      {card.location ? (
                        <p className="robot-marker-gamecard-meta">
                          <span className="robot-marker-gamecard-meta-label">Location</span>{" "}
                          <span className="robot-marker-gamecard-meta-value">
                            {card.location}
                          </span>
                        </p>
                      ) : null}
                      {card.task ? (
                        <p className="robot-marker-gamecard-meta">
                          <span className="robot-marker-gamecard-meta-label">Task</span>{" "}
                          <span className="robot-marker-gamecard-meta-value">{card.task}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })()}
            {layers.show_pois &&
              activePois.map((poi) => {
                const [x, y] = worldToImagePixels(map, viewport, poi.target_x, poi.target_y);
                const itemRef = refFromPoi(poi.poi_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const cardImage = poi.hero_image_url || poi.thumbnail_url;
                const cardId = `poi-gamecard-${poi.poi_id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
                const summary = poi.summary?.trim();
                return (
                  <button
                    className={["poi-pin", isSelected ? "is-selected" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-describedby={cardId}
                    aria-label={`POI ${poi.title}`}
                    key={poi.poi_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectItem(itemRef);
                    }}
                    onDragStart={preventNativeDrag}
                    onPointerDown={stopEvent}
                    style={{ left: `${x}px`, top: `${y}px` }}
                    type="button"
                  >
                    <img
                      alt=""
                      className="poi-pin-thumb"
                      decoding="async"
                      draggable={false}
                      onDragStart={preventNativeDrag}
                      src={poi.thumbnail_url}
                    />
                    <div className="poi-pin-gamecard" id={cardId} role="tooltip">
                      <div className="poi-pin-gamecard-media">
                        <img
                          alt=""
                          className="poi-pin-gamecard-img"
                          decoding="async"
                          draggable={false}
                          src={cardImage}
                        />
                      </div>
                      <div className="poi-pin-gamecard-body">
                        <div className="poi-pin-gamecard-title-row">
                          <span className="poi-pin-gamecard-title">{poi.title}</span>
                        </div>
                        {summary ? (
                          <p className="poi-pin-gamecard-summary">{summary}</p>
                        ) : null}
                        {poi.category ? (
                          <p className="poi-pin-gamecard-meta">
                            <span className="poi-pin-gamecard-meta-label">Category</span>{" "}
                            <span className="poi-pin-gamecard-meta-value">{poi.category}</span>
                          </p>
                        ) : null}
                        <p className="poi-pin-gamecard-meta">
                          <span className="poi-pin-gamecard-meta-label">Interest</span>{" "}
                          <span className="poi-pin-gamecard-meta-value">
                            {Math.round(poi.interest_score * 100)}%
                          </span>
                        </p>
                        {poi.objects.length > 0 ? (
                          <p className="poi-pin-gamecard-meta">
                            <span className="poi-pin-gamecard-meta-label">Objects</span>{" "}
                            <span className="poi-pin-gamecard-meta-value">
                              {poi.objects.slice(0, 4).join(", ")}
                              {poi.objects.length > 4 ? "…" : ""}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            {layers.show_yolo &&
              activeYoloObjects.map((object) => {
                const [x, y] = worldToImagePixels(map, viewport, object.world_x, object.world_y);
                const itemRef = refFromYoloObject(object.object_id);
                const itemKey = semanticKey(itemRef);
                const isSelected = selectedKey === itemKey;
                const showLabel = isSelected || labeledYoloIds.has(object.object_id);
                return (
                  <button
                    className={[
                      "yolo-chip",
                      showLabel ? "has-label" : "dot-only",
                      isSelected ? "is-selected" : "",
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
