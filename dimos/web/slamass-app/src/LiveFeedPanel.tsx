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
        {pov.available ? (
          <>
            <img alt="Robot POV" className="pov-image" src={pov.image_url} />
            <div className="media-badge">{connected ? "LIVE" : "STANDBY"}</div>
          </>
        ) : (
          <div className="panel-empty">
            <h3>POV not ready</h3>
            <p>Waiting for `observe()` frames.</p>
          </div>
        )}
      </div>
    </PanelShell>
  );
}
