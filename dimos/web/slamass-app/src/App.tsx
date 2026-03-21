import React, { startTransition } from "react";

import { LiveFeedPanel } from "./LiveFeedPanel";
import { MapPane } from "./MapPane";
import { OperatorRail } from "./OperatorRail";
import { PanelShell } from "./PanelShell";
import { AppState, InspectionSettings, ManualInspectionMode, Poi, UiCameraState, UiState } from "./types";

const LAYOUT_STORAGE_KEY = "slamass-layout-mode";
const MAX_ACTIVITY_ENTRIES = 10;

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
  inspection_settings: {
    manual_mode: "ai_gate",
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

type LayoutMode = "duo" | "trio";
type ActivityRole = "operator" | "system";
type ActivityTone = "neutral" | "accent" | "success" | "danger";
type ActivityEntry = {
  id: string;
  role: ActivityRole;
  tone: ActivityTone;
  title: string;
  detail: string;
  timestamp: string;
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

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "No data";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPoseLabel(state: AppState): string | null {
  if (!state.robot_pose) {
    return null;
  }

  return `${state.robot_pose.x.toFixed(2)}, ${state.robot_pose.y.toFixed(2)} | ${formatYaw(
    state.robot_pose.yaw,
  )}`;
}

function applyUiState(previous: UiState, next: UiState): UiState {
  return next.revision >= previous.revision ? next : previous;
}

function inspectionSignature(inspection: AppState["inspection"]): string {
  return `${inspection.status}|${inspection.message}|${inspection.poi_id ?? ""}`;
}

function getInitialLayoutMode(): LayoutMode {
  if (typeof window === "undefined") {
    return "duo";
  }

  const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (stored === "duo" || stored === "trio") {
    return stored;
  }

  return window.innerWidth >= 1280 ? "trio" : "duo";
}

function persistLayoutMode(next: LayoutMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
}

function toneForInspection(status: string): ActivityTone {
  if (status === "accepted") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "running") {
    return "accent";
  }
  return "neutral";
}

function inspectionLabel(manualMode: ManualInspectionMode): string {
  return manualMode === "always_create" ? "Always Create" : "AI Gate";
}

export default function App(): React.ReactElement {
  const [state, setState] = React.useState<AppState>(emptyState);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [layoutMode, setLayoutModeState] = React.useState<LayoutMode>(getInitialLayoutMode);
  const [activityEntries, setActivityEntries] = React.useState<ActivityEntry[]>(() => [
    {
      id: "boot",
      role: "system",
      tone: "neutral",
      title: "Session started",
      detail: "Waiting for POV and map updates.",
      timestamp: formatClock(new Date()),
    },
  ]);

  const cameraSyncTimerRef = React.useRef<number | null>(null);
  const activityCounterRef = React.useRef(1);
  const stateRef = React.useRef<AppState>(emptyState);
  const lastConnectedRef = React.useRef<boolean | null>(null);
  const lastInspectionRef = React.useRef<string>("");
  const mapReadyRef = React.useRef(false);
  const didLogInitialSnapshotRef = React.useRef(false);

  const selectedPoi = React.useMemo(
    () => state.pois.find((poi) => poi.poi_id === state.ui.selected_poi_id) ?? null,
    [state.pois, state.ui.selected_poi_id],
  );

  const appendActivity = React.useCallback(
    (role: ActivityRole, title: string, detail: string, tone: ActivityTone = "neutral") => {
      const entry = {
        id: `activity-${activityCounterRef.current}`,
        role,
        tone,
        title,
        detail,
        timestamp: formatClock(new Date()),
      };
      activityCounterRef.current += 1;
      setActivityEntries((previous) => [...previous, entry].slice(-MAX_ACTIVITY_ENTRIES));
    },
    [],
  );

  const reportActionError = React.useCallback(
    (title: string, error: unknown) => {
      const message = error instanceof Error ? error.message : "Request failed";
      appendActivity("system", title, message, "danger");
    },
    [appendActivity],
  );

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    return () => {
      if (cameraSyncTimerRef.current !== null) {
        window.clearTimeout(cameraSyncTimerRef.current);
      }
    };
  }, []);

  const setLayoutMode = React.useCallback((next: LayoutMode) => {
    setLayoutModeState(next);
    persistLayoutMode(next);
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
      try {
        const data = await fetchJson<AppState>("/api/state");
        if (cancelled) {
          return;
        }

        lastConnectedRef.current = data.connected;
        lastInspectionRef.current = inspectionSignature(data.inspection);
        mapReadyRef.current = data.map !== null;

        if (!didLogInitialSnapshotRef.current) {
          didLogInitialSnapshotRef.current = true;
          appendActivity(
            "system",
            data.connected ? "Robot online" : "Robot offline",
            data.map ? "Map loaded." : "Waiting for map data.",
            data.connected ? "success" : "neutral",
          );
        }

        startTransition(() => {
          setState(data);
        });
      } catch (error) {
        reportActionError("Initial state fetch failed", error);
      }
    };

    void loadState();

    const source = new EventSource("/api/events");

    source.addEventListener("state_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as Partial<AppState>;

      if (typeof payload.connected === "boolean" && payload.connected !== lastConnectedRef.current) {
        lastConnectedRef.current = payload.connected;
        appendActivity(
          "system",
          payload.connected ? "Robot reconnected" : "Robot disconnected",
          payload.connected ? "Live socket restored." : "Holding last known state.",
          payload.connected ? "success" : "danger",
        );
      }

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

      if (!mapReadyRef.current && payload) {
        mapReadyRef.current = true;
        appendActivity("system", "Map ready", "Occupancy map is rendering.", "success");
      }

      startTransition(() => {
        setState((previous) => ({ ...previous, map: payload }));
      });
    });

    source.addEventListener("poi_upserted", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as Poi;
      const existed = stateRef.current.pois.some((poi) => poi.poi_id === payload.poi_id);

      appendActivity(
        "system",
        existed ? "POI updated" : "POI added",
        payload.title,
        "success",
      );

      startTransition(() => {
        setState((previous) => ({ ...previous, pois: upsertPoi(previous.pois, payload) }));
      });
    });

    source.addEventListener("poi_deleted", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { poi_id: string };
      const deletedPoi = stateRef.current.pois.find((poi) => poi.poi_id === payload.poi_id);

      appendActivity(
        "system",
        "POI deleted",
        deletedPoi ? deletedPoi.title : "Semantic anchor removed.",
        "danger",
      );

      startTransition(() => {
        setState((previous) => ({
          ...previous,
          pois: previous.pois.filter((poi) => poi.poi_id !== payload.poi_id),
        }));
      });
    });

    source.addEventListener("inspection_updated", (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as AppState["inspection"];
      const signature = inspectionSignature(payload);

      if (signature !== lastInspectionRef.current) {
        lastInspectionRef.current = signature;
        appendActivity(
          "system",
          `Inspection ${payload.status}`,
          payload.message || "Inspection state changed.",
          toneForInspection(payload.status),
        );
      }

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
  }, [appendActivity, mergeUiState, reportActionError]);

  const handleInspectNow = React.useCallback(async () => {
    appendActivity("operator", "Inspect", "Manual semantic inspection started.", "accent");

    setBusyAction("inspect");
    try {
      await fetchJson("/api/inspect/now", { method: "POST" });
    } catch (error) {
      reportActionError("Inspect request failed", error);
    } finally {
      setBusyAction(null);
    }
  }, [appendActivity, reportActionError]);

  const handleSaveMap = React.useCallback(async () => {
    appendActivity("operator", "Save map", "Checkpoint requested.", "accent");

    setBusyAction("save");
    try {
      await fetchJson("/api/map/save", { method: "POST" });
      appendActivity("system", "Map saved", "Checkpoint written.", "success");
    } catch (error) {
      reportActionError("Save map failed", error);
    } finally {
      setBusyAction(null);
    }
  }, [appendActivity, reportActionError]);

  const handleInspectionModeChange = React.useCallback(
    async (manualMode: ManualInspectionMode) => {
      try {
        const nextSettings = await fetchJson<InspectionSettings>("/api/inspection-settings", {
          method: "PUT",
          body: JSON.stringify({ manual_mode: manualMode }),
        });
        startTransition(() => {
          setState((previous) => ({
            ...previous,
            inspection_settings: nextSettings,
          }));
        });
      } catch (error) {
        reportActionError("Inspection mode update failed", error);
      }
    },
    [reportActionError],
  );

  const handleNavigate = React.useCallback(
    async (x: number, y: number) => {
      appendActivity("operator", "Navigate", `${x.toFixed(2)}, ${y.toFixed(2)}`, "accent");

      try {
        await issueUiCommand("/api/ui/select-poi", {
          method: "POST",
          body: JSON.stringify({ poi_id: null }),
        });
        await fetchJson("/api/navigate", {
          method: "POST",
          body: JSON.stringify({ x, y }),
        });
      } catch (error) {
        reportActionError("Navigation request failed", error);
      }
    },
    [appendActivity, issueUiCommand, reportActionError],
  );

  const handleGoToPoi = React.useCallback(
    async (poiId: string) => {
      const poi = stateRef.current.pois.find((candidate) => candidate.poi_id === poiId);
      appendActivity("operator", "Go to POI", poi ? poi.title : poiId, "accent");

      setBusyAction(`go-${poiId}`);
      try {
        await fetchJson(`/api/pois/${poiId}/go`, { method: "POST" });
      } catch (error) {
        reportActionError("Go To request failed", error);
      } finally {
        setBusyAction(null);
      }
    },
    [appendActivity, reportActionError],
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
      } catch (error) {
        reportActionError("Delete POI failed", error);
      } finally {
        setBusyAction(null);
      }
    },
    [reportActionError],
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

      try {
        await issueUiCommand("/api/ui/select-poi", {
          method: "POST",
          body: JSON.stringify({ poi_id: poiId }),
        });
      } catch (error) {
        reportActionError("Select POI failed", error);
      }
    },
    [issueUiCommand, reportActionError],
  );

  const handleFocusPoi = React.useCallback(
    async (poiId: string) => {
      try {
        await issueUiCommand(`/api/ui/focus-poi/${poiId}`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      } catch (error) {
        reportActionError("Focus POI failed", error);
      }
    },
    [issueUiCommand, reportActionError],
  );

  const handleHighlightPoi = React.useCallback(
    async (poiId: string) => {
      try {
        await issueUiCommand("/api/ui/highlight-pois", {
          method: "POST",
          body: JSON.stringify({ poi_ids: [poiId], selected_poi_id: poiId }),
        });
      } catch (error) {
        reportActionError("Highlight POI failed", error);
      }
    },
    [issueUiCommand, reportActionError],
  );

  const handleFocusMap = React.useCallback(async () => {
    try {
      await issueUiCommand("/api/ui/focus-map", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      reportActionError("Fit map failed", error);
    }
  }, [issueUiCommand, reportActionError]);

  const handleFocusRobot = React.useCallback(async () => {
    try {
      await issueUiCommand("/api/ui/focus-robot", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      reportActionError("Focus robot failed", error);
    }
  }, [issueUiCommand, reportActionError]);

  const handleClearFocus = React.useCallback(async () => {
    try {
      await issueUiCommand("/api/ui/clear-focus", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (error) {
      reportActionError("Clear focus failed", error);
    }
  }, [issueUiCommand, reportActionError]);

  const poseLabel = formatPoseLabel(state);
  const povLabel = state.pov.updated_at ? formatTimestamp(state.pov.updated_at) : "No frame";
  const mapLabel = state.map ? formatTimestamp(state.map.updated_at) : "No map";

  return (
    <div className="app-shell">
      <div className="app-shell-noise" />

      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">S</div>
          <div className="topbar-brand-copy">
            <h1>SLAMASS</h1>
            <p>Semantic map ops</p>
          </div>
        </div>

        <div className="topbar-status">
          <span className={`toolbar-chip status-pill ${state.connected ? "is-live" : "is-offline"}`}>
            {state.connected ? "Online" : "Offline"}
          </span>
          <span className="toolbar-chip">{state.pois.length} POIs</span>
          <span className={`toolbar-chip tone-${state.inspection.status}`}>{state.inspection.status}</span>
          {poseLabel ? <span className="toolbar-chip monospace-chip">{poseLabel}</span> : null}
        </div>

        <div className="topbar-actions">
          <div className="layout-toggle" aria-label="Dashboard layout">
            <button
              className={layoutMode === "duo" ? "is-active" : ""}
              onClick={() => {
                if (layoutMode !== "duo") {
                  setLayoutMode("duo");
                }
              }}
              type="button"
            >
              Duo
            </button>
            <button
              className={layoutMode === "trio" ? "is-active" : ""}
              onClick={() => {
                if (layoutMode !== "trio") {
                  setLayoutMode("trio");
                }
              }}
              type="button"
            >
              Trio
            </button>
          </div>

          <label className="mode-select">
            <span>Inspect</span>
            <select
              onChange={(event) => {
                void handleInspectionModeChange(event.target.value as ManualInspectionMode);
              }}
              value={state.inspection_settings.manual_mode}
            >
              <option value="ai_gate">AI Gate</option>
              <option value="always_create">Always Create</option>
            </select>
          </label>

          <button
            className="action-button"
            disabled={busyAction !== null || state.inspection.status === "running"}
            onClick={() => {
              void handleInspectNow();
            }}
            type="button"
          >
            {state.inspection.status === "running" ? "Inspecting" : "Inspect"}
          </button>

          <button
            className="action-button secondary"
            disabled={busyAction !== null || state.map === null}
            onClick={() => {
              void handleSaveMap();
            }}
            type="button"
          >
            Save
          </button>
        </div>
      </header>

      <main className={`workspace workspace--${layoutMode}`}>
        <LiveFeedPanel
          connected={state.connected}
          frameLabel={povLabel}
          poseLabel={poseLabel}
          pov={state.pov}
        />

        <PanelShell
          aside={
            <div className="panel-chip-row">
              <span className="toolbar-chip">{state.pois.length} POIs</span>
              <span className="toolbar-chip">Map {mapLabel}</span>
            </div>
          }
          bodyClassName="panel-body-stage"
          className="map-panel"
          kicker="Spatial"
          title="Map"
        >
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
        </PanelShell>

        {layoutMode === "trio" ? (
          <OperatorRail
            activityEntries={activityEntries}
            busyAction={busyAction}
            inspection={state.inspection}
            inspectionModeLabel={inspectionLabel(state.inspection_settings.manual_mode)}
            onGoToPoi={(poiId) => {
              void handleGoToPoi(poiId);
            }}
            onHighlightPoi={(poiId) => {
              void handleHighlightPoi(poiId);
            }}
            onSelectPoi={(poiId) => {
              void handleSelectPoi(poiId);
            }}
            onFocusPoi={(poiId) => {
              void handleFocusPoi(poiId);
            }}
            onClearFocus={() => {
              void handleClearFocus();
            }}
            pois={state.pois}
            selectedPoi={selectedPoi}
          />
        ) : null}
      </main>

      {selectedPoi ? (
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
                <div className="poi-modal-header-actions">
                  <span className="score-pill">{selectedPoi.interest_score.toFixed(2)}</span>
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
              </div>

              <p className="poi-summary">{selectedPoi.summary}</p>

              <div className="poi-meta">
                <span>
                  {selectedPoi.world_x.toFixed(2)}, {selectedPoi.world_y.toFixed(2)} | {formatYaw(selectedPoi.world_yaw)}
                </span>
                <span>{formatTimestamp(selectedPoi.updated_at)}</span>
              </div>

              {selectedPoi.objects.length > 0 ? (
                <div className="poi-tags">
                  {selectedPoi.objects.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              ) : null}

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
                  Focus
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
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
