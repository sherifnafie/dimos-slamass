import React, { startTransition } from "react";

import { MapPane } from "./MapPane";
import { AppState, Poi, UiCameraState, UiState } from "./types";

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
  ui: {
    revision: 0,
    camera: {
      center_x: null,
      center_y: null,
      zoom: 1,
    },
    selected_poi_id: null,
    highlighted_poi_ids: [],
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

function formatYaw(yaw: number): string {
  return `${Math.round((yaw * 180) / Math.PI)}°`;
}

function applyUiState(previous: UiState, next: UiState): UiState {
  return next.revision >= previous.revision ? next : previous;
}

export default function App(): React.ReactElement {
  const [state, setState] = React.useState<AppState>(emptyState);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const cameraSyncTimerRef = React.useRef<number | null>(null);

  const selectedPoi = React.useMemo(
    () => state.pois.find((poi) => poi.poi_id === state.ui.selected_poi_id) ?? null,
    [state.pois, state.ui.selected_poi_id],
  );

  React.useEffect(() => {
    return () => {
      if (cameraSyncTimerRef.current !== null) {
        window.clearTimeout(cameraSyncTimerRef.current);
      }
    };
  }, []);

  const mergeUiState = React.useCallback((nextUi: UiState) => {
    if (cameraSyncTimerRef.current !== null) {
      window.clearTimeout(cameraSyncTimerRef.current);
      cameraSyncTimerRef.current = null;
    }
    startTransition(() => {
      setState((previous) => ({
        ...previous,
        ui: applyUiState(previous.ui, nextUi),
      }));
    });
  }, []);

  const issueUiCommand = React.useCallback(
    async (url: string, init?: RequestInit): Promise<UiState> => {
      const nextUi = await fetchJson<UiState>(url, init);
      mergeUiState(nextUi);
      return nextUi;
    },
    [mergeUiState],
  );

  const queueCameraSync = React.useCallback(
    (camera: UiCameraState) => {
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          ui: {
            ...previous.ui,
            camera,
          },
        }));
      });

      if (cameraSyncTimerRef.current !== null) {
        window.clearTimeout(cameraSyncTimerRef.current);
      }

      cameraSyncTimerRef.current = window.setTimeout(() => {
        void issueUiCommand("/api/ui/camera", {
          method: "PUT",
          body: JSON.stringify(camera),
        });
        cameraSyncTimerRef.current = null;
      }, 140);
    },
    [issueUiCommand],
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
      const payload = JSON.parse((event as MessageEvent<string>).data) as AppState["map"];
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
      });
    });
    source.addEventListener("inspection_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as AppState["inspection"];
      startTransition(() => {
        setState((previous) => ({ ...previous, inspection: payload }));
      });
    });
    source.addEventListener("ui_state_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as UiState;
      mergeUiState(payload);
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, [mergeUiState]);

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
    await issueUiCommand("/api/ui/select-poi", {
      method: "POST",
      body: JSON.stringify({ poi_id: null }),
    });
    await fetchJson("/api/navigate", {
      method: "POST",
      body: JSON.stringify({ x, y }),
    });
  }, [issueUiCommand]);

  const handleGoToPoi = React.useCallback(
    async (poiId: string) => {
      setBusyAction(`go-${poiId}`);
      try {
        await fetchJson(`/api/pois/${poiId}/go`, { method: "POST" });
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const handleDeletePoi = React.useCallback(
    async (poiId: string) => {
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
    },
    [],
  );

  const handleSelectPoi = React.useCallback(
    async (poiId: string | null) => {
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          ui: {
            ...previous.ui,
            selected_poi_id: poiId,
          },
        }));
      });
      await issueUiCommand("/api/ui/select-poi", {
        method: "POST",
        body: JSON.stringify({ poi_id: poiId }),
      });
    },
    [issueUiCommand],
  );

  const handleFocusPoi = React.useCallback(
    async (poiId: string) => {
      await issueUiCommand(`/api/ui/focus-poi/${poiId}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    [issueUiCommand],
  );

  const handleHighlightPoi = React.useCallback(
    async (poiId: string) => {
      await issueUiCommand("/api/ui/highlight-pois", {
        method: "POST",
        body: JSON.stringify({ poi_ids: [poiId], selected_poi_id: poiId }),
      });
    },
    [issueUiCommand],
  );

  const handleFocusMap = React.useCallback(async () => {
    await issueUiCommand("/api/ui/focus-map", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }, [issueUiCommand]);

  const handleFocusRobot = React.useCallback(async () => {
    await issueUiCommand("/api/ui/focus-robot", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }, [issueUiCommand]);

  const handleClearFocus = React.useCallback(async () => {
    await issueUiCommand("/api/ui/clear-focus", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }, [issueUiCommand]);

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
          </div>
          <MapPane
            map={state.map}
            onCameraChange={queueCameraSync}
            onClearFocus={() => {
              void handleClearFocus();
            }}
            onFocusMap={() => {
              void handleFocusMap();
            }}
            onFocusPoi={(poiId) => {
              void handleFocusPoi(poiId);
            }}
            onFocusRobot={() => {
              void handleFocusRobot();
            }}
            onNavigate={(x, y) => {
              void handleNavigate(x, y);
            }}
            onSelectPoi={(poiId) => {
              void handleSelectPoi(poiId);
            }}
            path={state.path}
            pois={state.pois}
            robotPose={state.robot_pose}
            ui={state.ui}
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
        <div
          className="poi-modal-backdrop"
          onClick={() => {
            void handleSelectPoi(null);
          }}
        >
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
                <button
                  className="close-button"
                  onClick={() => {
                    void handleSelectPoi(null);
                  }}
                  type="button"
                >
                  Close
                </button>
              </div>
              <p className="poi-summary">{selectedPoi.summary}</p>
              <div className="poi-meta">
                <span>
                  View pose: {selectedPoi.world_x.toFixed(2)}, {selectedPoi.world_y.toFixed(2)} |{" "}
                  {formatYaw(selectedPoi.world_yaw)}
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
                  className="action-button secondary"
                  onClick={() => {
                    void handleHighlightPoi(selectedPoi.poi_id);
                  }}
                  type="button"
                >
                  Highlight
                </button>
                <button
                  className="action-button secondary"
                  onClick={() => {
                    void handleFocusPoi(selectedPoi.poi_id);
                  }}
                  type="button"
                >
                  Focus View
                </button>
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
