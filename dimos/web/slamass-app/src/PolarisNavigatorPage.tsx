import React from "react";

import { NavigatorDashboardView } from "./navigator/NavigatorDashboardView";
import { useNavigatorSlamassState } from "./navigator/useNavigatorSlamassState";
import { PolarisLayout } from "./PolarisLayout";

function formatPolarisHeaderTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Polaris route: Navigator dashboard with shared Polaris chrome (header + shell) like Operators. */
export default function PolarisNavigatorPage(): React.ReactElement {
  const dashboard = useNavigatorSlamassState();
  const { state } = dashboard;
  const logTime = formatPolarisHeaderTime(new Date());
  const logRest = !state.pov.available
    ? "Camera — Waiting for camera feed…"
    : "Navigator — Same workspace layout as the main dashboard.";

  return (
    <PolarisLayout
      headerAside={
        <p
          aria-live={!state.pov.available ? "polite" : undefined}
          className="polaris-header-navigator-lede"
          role="status"
        >
          <span className="polaris-header-navigator-lede__time">{logTime}</span>{" "}
          <span className="polaris-header-navigator-lede__msg">{logRest}</span>
        </p>
      }
      shellBg="white"
    >
      <NavigatorDashboardView {...dashboard} />
    </PolarisLayout>
  );
}
