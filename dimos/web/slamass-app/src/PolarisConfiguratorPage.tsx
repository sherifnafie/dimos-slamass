import React from "react";

import { ConfiguratorCaptureFeed } from "./configurator/ConfiguratorCaptureFeed";
import { useConfiguratorSlamassState } from "./configurator/useConfiguratorSlamassState";
import { MapPane } from "./MapPane";
import { PanelShell } from "./PanelShell";
import { PolarisLayout } from "./PolarisLayout";

export default function PolarisConfiguratorPage(): React.ReactElement {
  const {
    state,
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
          >
            {state.connected ? "Robot online" : "Robot offline"}
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
