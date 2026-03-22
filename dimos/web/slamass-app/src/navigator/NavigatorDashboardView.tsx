import React, {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { AgentToolsModal } from "../AgentToolsModal";
import { LiveFeedPanel } from "../LiveFeedPanel";
import { MapPane } from "../MapPane";
import { OperatorRail, SelectedSemanticPreview } from "../OperatorRail";
import { PanelShell } from "../PanelShell";
import {
  buildSemanticItems,
  resolveSelectedPoi,
  resolveSelectedYoloObject,
} from "../semanticItems";
import {
  calculateTeleopCommand,
  isEditableTarget,
  normalizeTeleopKey,
  PUBLISH_RATE_HZ,
  teleopKeys,
} from "../teleop";
import type { ChatToolDefinition, ManualInspectionMode } from "../types";
import { fetchJson } from "./fetchJson";
import { useNavigatorSlamassState } from "./useNavigatorSlamassState";

type NavigatorDashboardViewProps = ReturnType<
  typeof useNavigatorSlamassState
>;

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

function formatPoseLabel(
  state: NavigatorDashboardViewProps["state"],
): string | null {
  if (!state.robot_pose) {
    return null;
  }
  return `${state.robot_pose.x.toFixed(2)}, ${state.robot_pose.y.toFixed(2)} | ${formatYaw(
    state.robot_pose.yaw,
  )}`;
}

export function NavigatorDashboardView(
  props: NavigatorDashboardViewProps,
): React.ReactElement {
  const {
    state,
    slamassApiStatus,
    layoutMode,
    setLayoutMode,
    busyAction,
    activityEntries,
    queueCameraSync,
    handleSelectItem,
    handleFocusItem,
    handleFocusMap,
    handleFocusRobot,
    handleClearFocus,
    handleNavigate,
    handleHighlightItem,
    handleGoToItem,
    handleDeleteItem,
    handleSubmitChatMessage,
    handleResetChat,
    handleInspectNow,
    handleSaveMap,
    handleInspectionModeChange,
    handleYoloModeChange,
    handleYoloInferenceEnabledChange,
    handleLayerToggle,
    handleClearLowLevelMapMemory,
    handleClearSemanticMemory,
    handleStopDimos,
    handleStopMotion,
    appendActivity,
    reportActionError,
  } = props;

  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [teleopEnabled, setTeleopEnabled] = useState(false);
  const [agentToolsOpen, setAgentToolsOpen] = useState(false);
  const [agentToolsLoading, setAgentToolsLoading] = useState(false);
  const [agentToolsError, setAgentToolsError] = useState<string | null>(null);
  const [agentTools, setAgentTools] = useState<ChatToolDefinition[] | null>(
    null,
  );

  const controlsMenuRef = useRef<HTMLDivElement>(null);
  const teleopIntervalRef = useRef<number | null>(null);
  const teleopKeysRef = useRef<Set<string>>(new Set());
  const teleopRequestInFlightRef = useRef(false);
  const teleopErrorMessageRef = useRef<string | null>(null);

  const selectedPoi = React.useMemo(
    () => resolveSelectedPoi(state.pois, state.ui.selected_item),
    [state.pois, state.ui.selected_item],
  );
  const selectedYoloObject = React.useMemo(
    () => resolveSelectedYoloObject(state.yolo_objects, state.ui.selected_item),
    [state.yolo_objects, state.ui.selected_item],
  );
  const semanticItems = React.useMemo(
    () => buildSemanticItems(state.pois, state.yolo_objects),
    [state.pois, state.yolo_objects],
  );

  const selectedPreview = React.useMemo<SelectedSemanticPreview | null>(() => {
    if (selectedPoi) {
      return {
        kind: "vlm_poi",
        entity_id: selectedPoi.poi_id,
        title: selectedPoi.title,
        subtitle: selectedPoi.category,
        summary: selectedPoi.summary,
        thumbnail_url: selectedPoi.thumbnail_url,
      };
    }
    if (selectedYoloObject) {
      return {
        kind: "yolo_object",
        entity_id: selectedYoloObject.object_id,
        title: selectedYoloObject.label,
        subtitle: `${Math.round(selectedYoloObject.best_confidence * 100)}% confidence`,
        summary: `${selectedYoloObject.detections_count} linked detections. Best view stored for revisit.`,
        thumbnail_url: selectedYoloObject.thumbnail_url,
      };
    }
    return null;
  }, [selectedPoi, selectedYoloObject]);

  const loadAgentTools = useCallback(async () => {
    setAgentToolsLoading(true);
    setAgentToolsError(null);
    try {
      const manifest = await fetchJson<ChatToolDefinition[]>("/api/chat/tools");
      startTransition(() => {
        setAgentTools(manifest);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load agent tools.";
      setAgentToolsError(message);
      reportActionError("Loading agent tools failed", error);
    } finally {
      setAgentToolsLoading(false);
    }
  }, [reportActionError]);

  const handleOpenAgentTools = useCallback(() => {
    setControlsMenuOpen(false);
    setAgentToolsOpen(true);
    if (!agentToolsLoading && agentTools === null && agentToolsError === null) {
      void loadAgentTools();
    }
  }, [agentTools, agentToolsError, agentToolsLoading, loadAgentTools]);

  useEffect(() => {
    if (!controlsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!controlsMenuRef.current?.contains(event.target as Node)) {
        setControlsMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setControlsMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [controlsMenuOpen]);

  const handleToggleTeleop = useCallback(() => {
    teleopKeysRef.current.clear();
    setTeleopEnabled((current) => {
      const next = !current;
      appendActivity(
        "operator",
        next ? "Teleop enabled" : "Teleop disabled",
        next ? "Keyboard control armed." : "Keyboard control released.",
        next ? "accent" : "neutral",
      );
      return next;
    });
  }, [appendActivity]);

  useEffect(() => {
    teleopKeysRef.current.clear();
    teleopErrorMessageRef.current = null;

    if (!teleopEnabled) {
      void handleStopMotion();
      return undefined;
    }

    const sendCurrentCommand = async (): Promise<void> => {
      if (teleopRequestInFlightRef.current) {
        return;
      }
      teleopRequestInFlightRef.current = true;
      try {
        await fetchJson("/api/teleop/command", {
          method: "POST",
          body: JSON.stringify(calculateTeleopCommand(teleopKeysRef.current)),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Teleop request failed";
        if (teleopErrorMessageRef.current !== message) {
          teleopErrorMessageRef.current = message;
          reportActionError("Teleop command failed", error);
          appendActivity(
            "system",
            "Teleop disabled",
            "Control path lost.",
            "danger",
          );
        }
        setTeleopEnabled(false);
      } finally {
        teleopRequestInFlightRef.current = false;
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const normalizedKey = normalizeTeleopKey(event.key);
      if (!teleopKeys.has(normalizedKey) || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      teleopKeysRef.current.add(normalizedKey);
      if (normalizedKey === " ") {
        void handleStopMotion();
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      const normalizedKey = normalizeTeleopKey(event.key);
      if (!teleopKeys.has(normalizedKey) || isEditableTarget(event.target)) {
        return;
      }
      teleopKeysRef.current.delete(normalizedKey);
    };

    const handleBlur = (): void => {
      teleopKeysRef.current.clear();
      setTeleopEnabled(false);
    };

    const handleFocus = (): void => {
      teleopKeysRef.current.clear();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    teleopIntervalRef.current = window.setInterval(() => {
      void sendCurrentCommand();
    }, 1000 / PUBLISH_RATE_HZ);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      if (teleopIntervalRef.current !== null) {
        window.clearInterval(teleopIntervalRef.current);
        teleopIntervalRef.current = null;
      }
      teleopKeysRef.current.clear();
      void handleStopMotion();
    };
  }, [appendActivity, handleStopMotion, reportActionError, teleopEnabled]);

  const poseLabel = formatPoseLabel(state);
  const povLabel = state.pov.updated_at
    ? formatTimestamp(state.pov.updated_at)
    : "No frame";
  const mapLabel = state.map ? formatTimestamp(state.map.updated_at) : "No map";

  return (
    <div className="app-shell app-shell--light">
      <div className="app-shell-noise" />

      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">S</div>
          <div className="topbar-brand-copy">
            <h1 data-testid="polaris-navigator-heading">SLAMASS</h1>
            <p>
              Navigator ·{" "}
              <a
                className="topbar-operators-link"
                data-testid="polaris-navigator-back"
                href="/polaris/operators"
              >
                Operators
              </a>
            </p>
          </div>
        </div>

        <div className="topbar-status">
          <span
            className={`toolbar-chip status-pill ${state.connected ? "is-live" : "is-offline"}`}
          >
            {state.connected ? "Online" : "Offline"}
          </span>
          {slamassApiStatus === "loading" ? (
            <span className="toolbar-chip">API…</span>
          ) : null}
          {slamassApiStatus === "error" ? (
            <span className="toolbar-chip tone-danger">API unreachable</span>
          ) : null}
          {teleopEnabled ? (
            <span className="toolbar-chip tone-danger">Teleop armed</span>
          ) : null}
          {state.inspection.status === "running" ? (
            <span className="toolbar-chip tone-running">Inspecting</span>
          ) : null}
          {state.chat.running ? (
            <span className="toolbar-chip tone-accent">Agent thinking</span>
          ) : null}
          {!state.yolo_runtime.inference_enabled ? (
            <span className="toolbar-chip tone-danger">YOLO off</span>
          ) : null}
          {state.yolo_runtime.mode !== "live" ? (
            <span className="toolbar-chip tone-accent">YOLO paused</span>
          ) : null}
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

          <button
            className="action-button"
            disabled={
              busyAction !== null || state.inspection.status === "running"
            }
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

          <button
            className={`action-button ${teleopEnabled ? "danger" : "success"}`}
            disabled={busyAction === "system-stop"}
            onClick={() => {
              handleToggleTeleop();
            }}
            type="button"
          >
            {teleopEnabled ? "Teleop On" : "Teleop Off"}
          </button>

          <button
            className="action-button danger"
            disabled={busyAction === "system-stop"}
            onClick={() => {
              void handleStopDimos();
            }}
            type="button"
          >
            {busyAction === "system-stop" ? "Stopping" : "Stop"}
          </button>

          <div className="topbar-menu" ref={controlsMenuRef}>
            <button
              aria-expanded={controlsMenuOpen}
              aria-haspopup="menu"
              className="action-button secondary"
              onClick={() => {
                setControlsMenuOpen((current) => !current);
              }}
              type="button"
            >
              Settings
            </button>

            {controlsMenuOpen ? (
              <div className="menu-popover">
                <label className="menu-field">
                  <span>Inspect mode</span>
                  <select
                    onChange={(event) => {
                      void handleInspectionModeChange(
                        event.target.value as ManualInspectionMode,
                      );
                      setControlsMenuOpen(false);
                    }}
                    value={state.inspection_settings.manual_mode}
                  >
                    <option value="ai_gate">AI Gate</option>
                    <option value="always_create">Always Create</option>
                  </select>
                </label>
                <button
                  className="menu-item"
                  onClick={() => {
                    handleOpenAgentTools();
                  }}
                  type="button"
                >
                  Agent tool calls
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    void handleYoloModeChange(
                      state.yolo_runtime.mode === "live" ? "paused" : "live",
                    );
                    setControlsMenuOpen(false);
                  }}
                  type="button"
                >
                  {state.yolo_runtime.mode === "live"
                    ? "Pause YOLO labeling"
                    : "Resume YOLO labeling"}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    void handleYoloInferenceEnabledChange(
                      !state.yolo_runtime.inference_enabled,
                    );
                    setControlsMenuOpen(false);
                  }}
                  type="button"
                >
                  {state.yolo_runtime.inference_enabled
                    ? "Turn YOLO inference off"
                    : "Turn YOLO inference on"}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    void handleLayerToggle(
                      "show_yolo",
                      !state.layers.show_yolo,
                    );
                    setControlsMenuOpen(false);
                  }}
                  type="button"
                >
                  {state.layers.show_yolo
                    ? "Hide YOLO layer"
                    : "Show YOLO layer"}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    void handleLayerToggle(
                      "show_pois",
                      !state.layers.show_pois,
                    );
                    setControlsMenuOpen(false);
                  }}
                  type="button"
                >
                  {state.layers.show_pois ? "Hide VLM layer" : "Show VLM layer"}
                </button>
                <div className="menu-divider" />
                <p className="menu-section-label">Danger zone</p>
                <button
                  className="menu-item menu-item-danger"
                  disabled={busyAction !== null || state.map === null}
                  onClick={() => {
                    void handleClearLowLevelMapMemory();
                    setControlsMenuOpen(false);
                  }}
                  type="button"
                >
                  Clear low-level map
                </button>
                <button
                  className="menu-item menu-item-danger"
                  disabled={
                    busyAction !== null ||
                    (state.pois.length === 0 && state.yolo_objects.length === 0)
                  }
                  onClick={() => {
                    void handleClearSemanticMemory();
                    setControlsMenuOpen(false);
                  }}
                  type="button"
                >
                  Clear semantic memory
                </button>
              </div>
            ) : null}
          </div>
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
              <span className="toolbar-chip">Updated {mapLabel}</span>
            </div>
          }
          bodyClassName="panel-body-stage"
          className="map-panel"
          kicker="Spatial"
          title="Map"
        >
          <MapPane
            layers={state.layers}
            map={state.map}
            onCameraChange={queueCameraSync}
            onClearFocus={() => {
              void handleClearFocus();
            }}
            onFocusItem={(item) => {
              void handleFocusItem(item);
            }}
            onFocusMap={() => {
              void handleFocusMap();
            }}
            onFocusRobot={() => {
              void handleFocusRobot();
            }}
            onNavigate={(x, y) => {
              void handleNavigate(x, y);
            }}
            onSelectItem={(item) => {
              void handleSelectItem(item);
            }}
            path={state.path}
            pois={state.pois}
            robotPose={state.robot_pose}
            ui={state.ui}
            yoloObjects={state.yolo_objects}
          />
        </PanelShell>

        {layoutMode === "trio" ? (
          <OperatorRail
            activityEntries={activityEntries}
            busyAction={busyAction}
            chat={state.chat}
            items={semanticItems}
            onClearFocus={() => {
              void handleClearFocus();
            }}
            onFocusItem={(item) => {
              void handleFocusItem(item);
            }}
            onGoToItem={(item) => {
              void handleGoToItem(item);
            }}
            onHighlightItem={(item) => {
              void handleHighlightItem(item);
            }}
            onResetChat={() => {
              void handleResetChat();
            }}
            onSelectItem={(item) => {
              void handleSelectItem(item);
            }}
            onSubmitChatMessage={(message) => {
              void handleSubmitChatMessage(message);
            }}
            selectedItem={state.ui.selected_item}
            selectedPreview={selectedPreview}
          />
        ) : null}
      </main>

      {selectedPoi || selectedYoloObject ? (
        <div
          className="poi-modal-backdrop"
          onClick={() => {
            void handleSelectItem(null);
          }}
        >
          <div
            className="poi-modal"
            onClick={(event) => event.stopPropagation()}
          >
            {selectedPoi ? (
              <>
                <div className="poi-modal-media">
                  <img
                    alt={selectedPoi.title}
                    src={selectedPoi.hero_image_url}
                  />
                </div>
                <div className="poi-modal-body">
                  <div className="poi-modal-header">
                    <div>
                      <p className="eyebrow">{selectedPoi.category}</p>
                      <h3>{selectedPoi.title}</h3>
                    </div>
                    <div className="poi-modal-header-actions">
                      <span className="score-pill">
                        {selectedPoi.interest_score.toFixed(2)}
                      </span>
                      <button
                        className="close-button"
                        onClick={() => {
                          void handleSelectItem(null);
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
                      Target {selectedPoi.target_x.toFixed(2)},{" "}
                      {selectedPoi.target_y.toFixed(2)}
                    </span>
                    <span>
                      View {selectedPoi.anchor_x.toFixed(2)},{" "}
                      {selectedPoi.anchor_y.toFixed(2)} |{" "}
                      {formatYaw(selectedPoi.anchor_yaw)}
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
                        void handleHighlightItem({
                          kind: "vlm_poi",
                          entity_id: selectedPoi.poi_id,
                        });
                      }}
                      type="button"
                    >
                      Highlight
                    </button>
                    <button
                      className="action-button secondary"
                      onClick={() => {
                        void handleFocusItem({
                          kind: "vlm_poi",
                          entity_id: selectedPoi.poi_id,
                        });
                      }}
                      type="button"
                    >
                      Focus
                    </button>
                    <button
                      className="action-button"
                      disabled={
                        busyAction === `go-vlm_poi-${selectedPoi.poi_id}`
                      }
                      onClick={() => {
                        void handleGoToItem({
                          kind: "vlm_poi",
                          entity_id: selectedPoi.poi_id,
                        });
                      }}
                      type="button"
                    >
                      Go To
                    </button>
                    <button
                      className="action-button danger"
                      disabled={
                        busyAction === `delete-vlm_poi-${selectedPoi.poi_id}`
                      }
                      onClick={() => {
                        void handleDeleteItem({
                          kind: "vlm_poi",
                          entity_id: selectedPoi.poi_id,
                        });
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            ) : selectedYoloObject ? (
              <>
                <div className="poi-modal-media">
                  <img
                    alt={selectedYoloObject.label}
                    src={selectedYoloObject.hero_image_url}
                  />
                </div>
                <div className="poi-modal-body">
                  <div className="poi-modal-header">
                    <div>
                      <p className="eyebrow">YOLO object</p>
                      <h3>{selectedYoloObject.label}</h3>
                    </div>
                    <div className="poi-modal-header-actions">
                      <span className="score-pill">
                        {Math.round(selectedYoloObject.best_confidence * 100)}%
                      </span>
                      <button
                        className="close-button"
                        onClick={() => {
                          void handleSelectItem(null);
                        }}
                        type="button"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <p className="poi-summary">
                    Stable YOLO object promoted from{" "}
                    {selectedYoloObject.detections_count} detections. Navigation
                    will restore the best recorded viewing pose.
                  </p>

                  <div className="poi-meta">
                    <span>
                      Object {selectedYoloObject.world_x.toFixed(2)},{" "}
                      {selectedYoloObject.world_y.toFixed(2)}
                    </span>
                    <span>
                      View {selectedYoloObject.best_view_x.toFixed(2)},{" "}
                      {selectedYoloObject.best_view_y.toFixed(2)} |{" "}
                      {formatYaw(selectedYoloObject.best_view_yaw)}
                    </span>
                    <span>
                      {formatTimestamp(selectedYoloObject.last_seen_at)}
                    </span>
                  </div>

                  <div className="poi-tags">
                    <span>{selectedYoloObject.label}</span>
                    <span>{selectedYoloObject.detections_count} hits</span>
                    <span>
                      {selectedYoloObject.size_x.toFixed(2)}m ×{" "}
                      {selectedYoloObject.size_y.toFixed(2)}m
                    </span>
                  </div>

                  <div className="poi-actions">
                    <button
                      className="action-button secondary"
                      onClick={() => {
                        void handleHighlightItem({
                          kind: "yolo_object",
                          entity_id: selectedYoloObject.object_id,
                        });
                      }}
                      type="button"
                    >
                      Highlight
                    </button>
                    <button
                      className="action-button secondary"
                      onClick={() => {
                        void handleFocusItem({
                          kind: "yolo_object",
                          entity_id: selectedYoloObject.object_id,
                        });
                      }}
                      type="button"
                    >
                      Focus
                    </button>
                    <button
                      className="action-button"
                      disabled={
                        busyAction ===
                        `go-yolo_object-${selectedYoloObject.object_id}`
                      }
                      onClick={() => {
                        void handleGoToItem({
                          kind: "yolo_object",
                          entity_id: selectedYoloObject.object_id,
                        });
                      }}
                      type="button"
                    >
                      Go To
                    </button>
                    <button
                      className="action-button danger"
                      disabled={
                        busyAction ===
                        `delete-yolo_object-${selectedYoloObject.object_id}`
                      }
                      onClick={() => {
                        void handleDeleteItem({
                          kind: "yolo_object",
                          entity_id: selectedYoloObject.object_id,
                        });
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {agentToolsOpen ? (
        <AgentToolsModal
          error={agentToolsError}
          loading={agentToolsLoading}
          onClose={() => {
            setAgentToolsOpen(false);
          }}
          onReload={() => {
            void loadAgentTools();
          }}
          tools={agentTools}
        />
      ) : null}
    </div>
  );
}
