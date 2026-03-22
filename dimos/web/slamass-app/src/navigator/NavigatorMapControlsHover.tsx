import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ArrowsPointingInIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  SignalIcon,
  StopCircleIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import React from "react";

import type { MapState, RobotPose } from "../types";

function RobotControlsGlyph(props: { className?: string }): React.ReactElement {
  const { className } = props;
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3v2M9 3h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <rect
        height="11"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.5"
        width="12"
        x="6"
        y="7"
      />
      <circle cx="9.5" cy="12" fill="currentColor" r="1.1" />
      <circle cx="14.5" cy="12" fill="currentColor" r="1.1" />
      <path
        d="M9 21v-2.5M15 21v-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export type NavigatorMapControlsHoverProps = {
  busyAction: string | null;
  connected: boolean;
  inspectionRunning: boolean;
  map: MapState | null;
  openaiConfigured: boolean;
  robotPose: RobotPose | null;
  teleopEnabled: boolean;
  onClearFocus: () => void;
  onFitMap: () => void;
  onFocusRobot: () => void;
  onInspect: () => void;
  onSaveMap: () => void;
  onStopMotion: () => void;
  onStopStack: () => void;
  onToggleTeleop: () => void;
};

/**
 * Robot icon + “Controls” label; menu expands downward on hover / focus-within.
 * Navigator places this in the map panel header beside Settings; other layouts may overlay on the map.
 */
export function NavigatorMapControlsHover(
  props: NavigatorMapControlsHoverProps,
): React.ReactElement {
  const {
    busyAction,
    connected,
    inspectionRunning,
    map,
    openaiConfigured,
    robotPose,
    teleopEnabled,
    onClearFocus,
    onFitMap,
    onFocusRobot,
    onInspect,
    onSaveMap,
    onStopMotion,
    onStopStack,
    onToggleTeleop,
  } = props;

  const inspectDisabled =
    busyAction !== null || inspectionRunning || !connected;
  const saveDisabled = busyAction !== null || map === null;
  const stopStackDisabled = busyAction === "system-stop";

  return (
    <div className="polaris-map-controls-dock">
      <button
        aria-haspopup="menu"
        className="polaris-map-controls-dock__trigger"
        type="button"
      >
        <RobotControlsGlyph className="polaris-map-controls-dock__robot-icon" />
        <span className="polaris-map-controls-dock__label">Controls</span>
        <ChevronDownIcon
          aria-hidden
          className="polaris-map-controls-dock__chevron"
        />
      </button>

      <div className="polaris-map-controls-dock__panel" role="menu">
        <p className="polaris-map-controls-dock__kicker">Navigator</p>

        <button
          className="polaris-map-controls-dock__item"
          role="menuitem"
          type="button"
          onClick={onFitMap}
        >
          <ArrowsPointingInIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>Fit map</span>
        </button>
        <button
          className="polaris-map-controls-dock__item"
          disabled={!robotPose}
          role="menuitem"
          type="button"
          onClick={onFocusRobot}
        >
          <ViewfinderCircleIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>Focus robot</span>
        </button>
        <button
          className="polaris-map-controls-dock__item"
          role="menuitem"
          type="button"
          onClick={onClearFocus}
        >
          <ArrowPathRoundedSquareIcon
            aria-hidden
            className="polaris-map-controls-dock__item-icon"
          />
          <span>Clear focus</span>
        </button>

        <div aria-hidden className="polaris-map-controls-dock__rule" />

        <p className="polaris-map-controls-dock__kicker">Robot</p>

        <button
          aria-label={
            teleopEnabled ? "Disarm keyboard teleop" : "Arm keyboard teleop"
          }
          className={`polaris-map-controls-dock__item${teleopEnabled ? " polaris-map-controls-dock__item--accent" : ""}`}
          disabled={busyAction === "system-stop"}
          role="menuitem"
          type="button"
          onClick={onToggleTeleop}
        >
          <SignalIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>{teleopEnabled ? "Teleop on — click to disarm" : "Teleop — arm keys"}</span>
        </button>
        <button
          className="polaris-map-controls-dock__item"
          disabled={busyAction === "system-stop"}
          role="menuitem"
          type="button"
          onClick={onStopMotion}
        >
          <StopCircleIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>Stop motion</span>
        </button>

        <div aria-hidden className="polaris-map-controls-dock__rule" />

        <button
          aria-label={
            openaiConfigured
              ? inspectionRunning
                ? "Inspecting"
                : "Inspect current view"
              : "Inspect — save camera view (add OPENAI_API_KEY for VLM)"
          }
          className="polaris-map-controls-dock__item"
          disabled={inspectDisabled}
          role="menuitem"
          title={
            openaiConfigured
              ? undefined
              : "Saves POV without VLM; set OPENAI_API_KEY for AI inspect."
          }
          type="button"
          onClick={onInspect}
        >
          <MagnifyingGlassIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>{inspectionRunning ? "Inspecting…" : "Inspect"}</span>
        </button>
        <button
          aria-label="Save map checkpoint"
          className="polaris-map-controls-dock__item"
          disabled={saveDisabled}
          role="menuitem"
          type="button"
          onClick={onSaveMap}
        >
          <ArrowDownTrayIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>Save map</span>
        </button>

        <div aria-hidden className="polaris-map-controls-dock__rule" />

        <button
          aria-busy={stopStackDisabled}
          aria-label="Stop DimOS stack"
          className="polaris-map-controls-dock__item polaris-map-controls-dock__item--danger"
          disabled={stopStackDisabled}
          role="menuitem"
          type="button"
          onClick={onStopStack}
        >
          <StopCircleIcon aria-hidden className="polaris-map-controls-dock__item-icon" />
          <span>Stop DimOS stack</span>
        </button>
      </div>
    </div>
  );
}
