import React from "react";

import { ConfiguratorCaptureFeed } from "./configurator/ConfiguratorCaptureFeed";
import { useConfiguratorSlamassState } from "./configurator/useConfiguratorSlamassState";
import { MapPane } from "./MapPane";
import { PanelShell } from "./PanelShell";
import { PolarisLayout } from "./PolarisLayout";

const MAP_SOCKET_HELP =
  "SLAMASS must connect to DimOS websocket_vis (Socket.IO), default http://127.0.0.1:7779. Start the robot stack first, e.g. dimos --simulation --viewer none run unitree-go2-slamass-mcp --daemon, then dimos-slamass. Override with dimos-slamass --map-socket-url if needed.";

export default function PolarisConfiguratorPage(): React.ReactElement {
  const {
    state,
    slamassApiStatus,
    queueCameraSync,
    handleSelectItem,
    handleFocusItem,
    handleFocusMap,
    handleFocusRobot,
    handleClearFocus,
  } = useConfiguratorSlamassState();

  return (
    <PolarisLayout shellBg="white">
      <main className="polaris-configurator-main">
        <div className="polaris-configurator-toolbar">
          <a
            className="polaris-configurator-back"
            data-testid="polaris-configurator-back"
            href="/polaris/operators"
          >
            ← Operators
          </a>
          <h1 className="polaris-configurator-title" data-testid="polaris-configurator-heading">
            Configurator
          </h1>
          <span
            aria-live="polite"
            className="polaris-configurator-status"
            role="status"
            title={
              slamassApiStatus === "error"
                ? "Could not load /api/state from the SLAMASS sidecar (wrong URL, CORS, or dimos-slamass not running)."
                : slamassApiStatus === "loading"
                  ? "Loading SLAMASS state…"
                  : state.connected
                    ? "DimOS map socket is connected; pose, costmap, and POV can stream."
                    : MAP_SOCKET_HELP
            }
          >
            {slamassApiStatus === "loading"
              ? "Connecting…"
              : slamassApiStatus === "error"
                ? "SLAMASS unreachable"
                : state.connected
                  ? "Map socket online"
                  : "Map socket offline"}
          </span>
        </div>

        <div className="polaris-configurator-split">
          <section
            aria-label="Capture feed"
            className="polaris-configurator-column polaris-configurator-column--feed"
          >
            <ConfiguratorCaptureFeed state={state} />
          </section>

          <section
            aria-label="Spatial map"
            className="polaris-configurator-column polaris-configurator-column--map polaris-configurator-map"
          >
            <PanelShell
              bodyClassName="panel-body-stage map-panel"
              kicker="Live"
              title="Spatial map"
            >
              <MapPane
                layers={state.layers}
                map={state.map}
                onCameraChange={queueCameraSync}
                onClearFocus={handleClearFocus}
                onFocusItem={handleFocusItem}
                onFocusMap={handleFocusMap}
                onFocusRobot={handleFocusRobot}
                onNavigate={(_x, _y) => {
                  /* read-only: no goal publish from configurator */
                }}
                onSelectItem={handleSelectItem}
                path={state.path}
                pois={state.pois}
                robotPose={state.robot_pose}
                ui={state.ui}
                yoloObjects={state.yolo_objects}
              />
            </PanelShell>
          </section>
        </div>
      </main>
    </PolarisLayout>
  );
}
