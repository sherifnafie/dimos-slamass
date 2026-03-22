import React from "react";

import { PanelShell } from "./PanelShell";
import { PovState } from "./types";

type LiveFeedPanelProps = {
  connected: boolean;
  pov: PovState;
  poseLabel: string | null;
  frameLabel: string;
};

export function LiveFeedPanel(props: LiveFeedPanelProps): React.ReactElement {
  const { connected, pov, poseLabel, frameLabel } = props;

  return (
    <PanelShell
      aside={
        <div className="panel-chip-row">
          {poseLabel ? <span className="toolbar-chip monospace-chip">{poseLabel}</span> : null}
          <span className="toolbar-chip">{pov.available ? `Updated ${frameLabel}` : frameLabel}</span>
        </div>
      }
      bodyClassName="panel-body-stage"
      className="feed-panel"
      kicker="Live"
      title="POV"
    >
      <div className="pov-stage">
        <img alt="Robot POV" className="pov-image" decoding="async" src={pov.image_url} />
        <div className="media-badge">{connected ? "LIVE" : "STANDBY"}</div>
        {!pov.available ? (
          <div className="pov-pending-banner" role="status">
            Waiting for camera feed…
          </div>
        ) : null}
      </div>
    </PanelShell>
  );
}
