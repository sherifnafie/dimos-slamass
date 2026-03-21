import React, { startTransition } from "react";

import { AppState, MapState, Poi, RobotPose } from "./types";

const emptyState: AppState = {
  connected: false,
  robot_pose: null,
  path: [],
  pov: {
    available: false,
    seq: 0,
    updated_at: null,
    image_url: "/api/pov/latest.jpg?v=0",
  },
  map: null,
  pois: [],
  inspection: {
    status: "idle",
    message: "",
    poi_id: null,
  },
};

function upsertPoi(existing: Poi[], nextPoi: Poi): Poi[] {
  const index = existing.findIndex((poi) => poi.poi_id === nextPoi.poi_id);
  if (index === -1) {
    return [...existing, nextPoi];
  }
  const copy = existing.slice();
  copy[index] = nextPoi;
  return copy;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `${response.status}`);
  }
  return (await response.json()) as T;
}

type Viewport = {
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
};

function buildViewport(map: MapState, width: number, height: number): Viewport {
  const drawScale = Math.min(width / map.width, height / map.height);
  const drawWidth = map.width * drawScale;
  const drawHeight = map.height * drawScale;
  return {
    drawWidth,
    drawHeight,
    offsetX: (width - drawWidth) / 2,
    offsetY: (height - drawHeight) / 2,
  };
}

function worldToScreen(map: MapState, viewport: Viewport, x: number, y: number): [number, number] {
  const normalizedX = (x - map.origin_x) / (map.width * map.resolution);
  const normalizedY = (y - map.origin_y) / (map.height * map.resolution);
  return [
    viewport.offsetX + normalizedX * viewport.drawWidth,
    viewport.offsetY + viewport.drawHeight - normalizedY * viewport.drawHeight,
  ];
}

function screenToWorld(
  map: MapState,
  viewport: Viewport,
  screenX: number,
  screenY: number,
): [number, number] {
  const normalizedX = (screenX - viewport.offsetX) / viewport.drawWidth;
  const normalizedY = 1 - (screenY - viewport.offsetY) / viewport.drawHeight;
  return [
    map.origin_x + normalizedX * map.width * map.resolution,
    map.origin_y + normalizedY * map.height * map.resolution,
  ];
}

function formatYaw(yaw: number): string {
  return `${Math.round((yaw * 180) / Math.PI)}°`;
}

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

type MapPaneProps = {
  map: MapState | null;
  robotPose: RobotPose | null;
  path: Array<[number, number]>;
  pois: Poi[];
  selectedPoiId: string | null;
  onSelectPoi: (poiId: string | null) => void;
  onNavigate: (x: number, y: number) => void;
};

function MapPane(props: MapPaneProps): React.ReactElement {
  const { map, robotPose, path, pois, selectedPoiId, onSelectPoi, onNavigate } = props;
  const [containerRef, size] = useSize<HTMLDivElement>();

  const viewport = React.useMemo(() => {
    if (!map || size.width <= 0 || size.height <= 0) {
      return null;
    }
    return buildViewport(map, size.width, size.height);
  }, [map, size.height, size.width]);

  const robotPoint = React.useMemo(() => {
    if (!map || !viewport || !robotPose) {
      return null;
    }
    return worldToScreen(map, viewport, robotPose.x, robotPose.y);
  }, [map, robotPose, viewport]);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!map || !viewport) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      if (
        localX < viewport.offsetX ||
        localY < viewport.offsetY ||
        localX > viewport.offsetX + viewport.drawWidth ||
        localY > viewport.offsetY + viewport.drawHeight
      ) {
        return;
      }

      const [worldX, worldY] = screenToWorld(map, viewport, localX, localY);
      onNavigate(worldX, worldY);
      onSelectPoi(null);
    },
    [map, onNavigate, onSelectPoi, viewport],
  );

  return (
    <div className="map-surface" ref={containerRef} onClick={handleClick}>
      {!map || !viewport ? (
        <div className="panel-empty">
          <h3>SLAMASS map not ready</h3>
          <p>Start the Go2 stack and wait for the service to ingest raw costmap updates.</p>
        </div>
      ) : (
        <>
          <img
            alt="SLAMASS occupancy map"
            className="map-image"
            src={map.image_url}
            style={{
              width: `${viewport.drawWidth}px`,
              height: `${viewport.drawHeight}px`,
              left: `${viewport.offsetX}px`,
              top: `${viewport.offsetY}px`,
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
            {robotPoint && robotPose && (
              <g transform={`translate(${robotPoint[0]}, ${robotPoint[1]})`}>
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
            )}
            {pois
              .filter((poi) => poi.status !== "deleted")
              .map((poi) => {
                const [x, y] = worldToScreen(map, viewport, poi.world_x, poi.world_y);
                return (
                  <line
                    key={`${poi.poi_id}-tether`}
                    className="poi-tether"
                    x1={x}
                    y1={y}
                    x2={x}
                    y2={y - 34}
                  />
                );
              })}
          </svg>
          {pois
            .filter((poi) => poi.status !== "deleted")
            .map((poi) => {
              const [x, y] = worldToScreen(map, viewport, poi.world_x, poi.world_y);
              const isSelected = poi.poi_id === selectedPoiId;
              return (
                <button
                  key={poi.poi_id}
                  className={`poi-card ${isSelected ? "is-selected" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectPoi(poi.poi_id);
                  }}
                  style={{ left: `${x}px`, top: `${y - 42}px` }}
                  type="button"
                >
                  <img alt={poi.title} src={poi.thumbnail_url} />
                  <span>{poi.title}</span>
                </button>
              );
            })}
        </>
      )}
    </div>
  );
}

export default function App(): React.ReactElement {
  const [state, setState] = React.useState<AppState>(emptyState);
  const [selectedPoiId, setSelectedPoiId] = React.useState<string | null>(null);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const selectedPoi = React.useMemo(
    () => state.pois.find((poi) => poi.poi_id === selectedPoiId) ?? null,
    [selectedPoiId, state.pois],
  );

  React.useEffect(() => {
    let cancelled = false;

    const loadState = async (): Promise<void> => {
      const data = await fetchJson<AppState>("/api/state");
      if (cancelled) {
        return;
      }
      startTransition(() => {
        setState(data);
        if (data.inspection.poi_id) {
          setSelectedPoiId(data.inspection.poi_id);
        }
      });
    };

    void loadState();

    const source = new EventSource("/api/events");
    source.addEventListener("state_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as Partial<AppState>;
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          ...payload,
          pov: payload.pov ? { ...previous.pov, ...payload.pov } : previous.pov,
        }));
      });
    });
    source.addEventListener("map_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as MapState;
      startTransition(() => {
        setState((previous) => ({ ...previous, map: payload }));
      });
    });
    source.addEventListener("poi_upserted", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as Poi;
      startTransition(() => {
        setState((previous) => ({ ...previous, pois: upsertPoi(previous.pois, payload) }));
      });
    });
    source.addEventListener("poi_deleted", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { poi_id: string };
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          pois: previous.pois.filter((poi) => poi.poi_id !== payload.poi_id),
        }));
        setSelectedPoiId((current) => (current === payload.poi_id ? null : current));
      });
    });
    source.addEventListener("inspection_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as AppState["inspection"];
      startTransition(() => {
        setState((previous) => ({ ...previous, inspection: payload }));
        if (payload.poi_id) {
          setSelectedPoiId(payload.poi_id);
        }
      });
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  const handleInspectNow = React.useCallback(async () => {
    setBusyAction("inspect");
    try {
      await fetchJson("/api/inspect/now", { method: "POST" });
    } finally {
      setBusyAction(null);
    }
  }, []);

  const handleSaveMap = React.useCallback(async () => {
    setBusyAction("save");
    try {
      await fetchJson("/api/map/save", { method: "POST" });
    } finally {
      setBusyAction(null);
    }
  }, []);

  const handleNavigate = React.useCallback(async (x: number, y: number) => {
    await fetchJson("/api/navigate", {
      method: "POST",
      body: JSON.stringify({ x, y }),
    });
  }, []);

  const handleGoToPoi = React.useCallback(async (poiId: string) => {
    setBusyAction(`go-${poiId}`);
    try {
      await fetchJson(`/api/pois/${poiId}/go`, { method: "POST" });
    } finally {
      setBusyAction(null);
    }
  }, []);

  const handleDeletePoi = React.useCallback(async (poiId: string) => {
    const confirmed = window.confirm("Delete this POI from the SLAMASS map?");
    if (!confirmed) {
      return;
    }
    setBusyAction(`delete-${poiId}`);
    try {
      await fetchJson(`/api/pois/${poiId}/delete`, { method: "POST" });
    } finally {
      setBusyAction(null);
    }
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Remote semantic mapping demo</p>
          <h1>SLAMASS</h1>
        </div>
        <div className="topbar-actions">
          <div className={`status-pill ${state.connected ? "is-live" : "is-offline"}`}>
            {state.connected ? "Robot linked" : "Awaiting map socket"}
          </div>
          <button
            className="action-button"
            disabled={busyAction !== null || state.inspection.status === "running"}
            onClick={() => {
              void handleInspectNow();
            }}
            type="button"
          >
            {state.inspection.status === "running" ? "Inspecting..." : "Inspect Now"}
          </button>
          <button
            className="action-button secondary"
            disabled={busyAction !== null || state.map === null}
            onClick={() => {
              void handleSaveMap();
            }}
            type="button"
          >
            Save Map
          </button>
        </div>
      </header>

      <main className="split-layout">
        <section className="feed-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Live feed</p>
              <h2>Robot POV</h2>
            </div>
            {state.robot_pose && (
              <div className="pose-pill">
                {state.robot_pose.x.toFixed(2)}, {state.robot_pose.y.toFixed(2)} |{" "}
                {formatYaw(state.robot_pose.yaw)}
              </div>
            )}
          </div>
          <div className="pov-surface">
            {state.pov.available ? (
              <img alt="Robot POV" className="pov-image" src={state.pov.image_url} />
            ) : (
              <div className="panel-empty">
                <h3>POV feed not ready</h3>
                <p>Waiting for `observe()` frames through the MCP server.</p>
              </div>
            )}
          </div>
          <div className="panel-footer">
            <span>Sequence {state.pov.seq}</span>
            <span>{state.pov.updated_at ?? "No frame yet"}</span>
          </div>
        </section>

        <section className="feed-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Persistent substrate</p>
              <h2>SLAMASS Map</h2>
            </div>
            <div className="panel-footnote">
              Click map to navigate. Click a floating card to inspect a POI.
            </div>
          </div>
          <MapPane
            map={state.map}
            onNavigate={(x, y) => {
              void handleNavigate(x, y);
            }}
            onSelectPoi={setSelectedPoiId}
            path={state.path}
            pois={state.pois}
            robotPose={state.robot_pose}
            selectedPoiId={selectedPoiId}
          />
          <div className="panel-footer inspection-footer">
            <span className={`inspection-state state-${state.inspection.status}`}>
              {state.inspection.status}
            </span>
            <span>{state.inspection.message || "No inspection activity yet"}</span>
          </div>
        </section>
      </main>

      {selectedPoi && (
        <div className="poi-modal-backdrop" onClick={() => setSelectedPoiId(null)}>
          <div className="poi-modal" onClick={(event) => event.stopPropagation()}>
            <div className="poi-modal-media">
              <img alt={selectedPoi.title} src={selectedPoi.hero_image_url} />
            </div>
            <div className="poi-modal-body">
              <div className="poi-modal-header">
                <div>
                  <p className="eyebrow">{selectedPoi.category}</p>
                  <h3>{selectedPoi.title}</h3>
                </div>
                <button className="close-button" onClick={() => setSelectedPoiId(null)} type="button">
                  Close
                </button>
              </div>
              <p className="poi-summary">{selectedPoi.summary}</p>
              <div className="poi-meta">
                <span>
                  Pose: {selectedPoi.world_x.toFixed(2)}, {selectedPoi.world_y.toFixed(2)}
                </span>
                <span>Score: {selectedPoi.interest_score.toFixed(2)}</span>
              </div>
              {selectedPoi.objects.length > 0 && (
                <div className="poi-tags">
                  {selectedPoi.objects.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              )}
              <div className="poi-actions">
                <button
                  className="action-button"
                  disabled={busyAction === `go-${selectedPoi.poi_id}`}
                  onClick={() => {
                    void handleGoToPoi(selectedPoi.poi_id);
                  }}
                  type="button"
                >
                  Go To
                </button>
                <button
                  className="action-button danger"
                  disabled={busyAction === `delete-${selectedPoi.poi_id}`}
                  onClick={() => {
                    void handleDeletePoi(selectedPoi.poi_id);
                  }}
                  type="button"
                >
                  Delete POI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
