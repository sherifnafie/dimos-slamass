import React from "react";

import { PanelShell } from "./PanelShell";
import { InspectionState, Poi } from "./types";

type ActivityEntry = {
  id: string;
  role: "operator" | "system";
  tone: "neutral" | "accent" | "success" | "danger";
  title: string;
  detail: string;
  timestamp: string;
};

type RailView = "timeline" | "pois";

type OperatorRailProps = {
  activityEntries: ActivityEntry[];
  busyAction: string | null;
  inspection: InspectionState;
  inspectionModeLabel: string;
  pois: Poi[];
  selectedPoi: Poi | null;
  onSelectPoi: (poiId: string | null) => void;
  onHighlightPoi: (poiId: string) => void;
  onFocusPoi: (poiId: string) => void;
  onGoToPoi: (poiId: string) => void;
  onClearFocus: () => void;
};

export function OperatorRail(props: OperatorRailProps): React.ReactElement {
  const {
    activityEntries,
    busyAction,
    inspection,
    inspectionModeLabel,
    pois,
    selectedPoi,
    onSelectPoi,
    onHighlightPoi,
    onFocusPoi,
    onGoToPoi,
    onClearFocus,
  } = props;

  const [railView, setRailView] = React.useState<RailView>("timeline");

  const visiblePois = React.useMemo(
    () =>
      pois
        .filter((poi) => poi.status !== "deleted")
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [pois],
  );

  const visibleEntries = React.useMemo(() => activityEntries.slice(-8), [activityEntries]);

  return (
    <PanelShell
      aside={
        <div className="rail-tabs" role="tablist" aria-label="Chat rail views">
          <button
            className={railView === "timeline" ? "is-active" : ""}
            onClick={() => {
              setRailView("timeline");
            }}
            type="button"
          >
            Timeline
          </button>
          <button
            className={railView === "pois" ? "is-active" : ""}
            onClick={() => {
              setRailView("pois");
            }}
            type="button"
          >
            POIs
          </button>
        </div>
      }
      bodyClassName="panel-body-console"
      className="console-panel"
      kicker="Operator"
      title="Chat"
    >
      <div className="rail-stack">
        <div className="rail-summary">
          <span className={`toolbar-chip tone-${inspection.status}`}>{inspection.status}</span>
          <span className="toolbar-chip">{inspectionModeLabel}</span>
          <span className="toolbar-chip">{visiblePois.length} POIs</span>
        </div>

        {selectedPoi ? (
          <section className="rail-selected-card">
            <img alt={selectedPoi.title} src={selectedPoi.thumbnail_url} />
            <div className="rail-selected-copy">
              <div className="rail-selected-topline">
                <strong>{selectedPoi.title}</strong>
                <span>{selectedPoi.category}</span>
              </div>
              <p>{selectedPoi.summary}</p>
            </div>
            <div className="rail-selected-actions">
              <button className="mini-button" onClick={() => onFocusPoi(selectedPoi.poi_id)} type="button">
                Focus
              </button>
              <button className="mini-button" onClick={() => onHighlightPoi(selectedPoi.poi_id)} type="button">
                Highlight
              </button>
              <button
                className="mini-button mini-button-primary"
                disabled={busyAction === `go-${selectedPoi.poi_id}`}
                onClick={() => onGoToPoi(selectedPoi.poi_id)}
                type="button"
              >
                Go
              </button>
              <button className="mini-button" onClick={() => onClearFocus()} type="button">
                Clear
              </button>
            </div>
          </section>
        ) : null}

        <div className="rail-content">
          {railView === "timeline" ? (
            <div className="rail-thread">
              {visibleEntries.map((entry) => (
                <article
                  className={`thread-message role-${entry.role} tone-${entry.tone}`}
                  key={entry.id}
                >
                  <div className="thread-message-header">
                    <strong>{entry.title}</strong>
                    <time>{entry.timestamp}</time>
                  </div>
                  <p>{entry.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rail-poi-list">
              {visiblePois.length > 0 ? (
                visiblePois.map((poi) => (
                  <article className="rail-poi-item" key={poi.poi_id}>
                    <button
                      className={`rail-poi-main ${selectedPoi?.poi_id === poi.poi_id ? "is-active" : ""}`}
                      onClick={() => onSelectPoi(poi.poi_id)}
                      type="button"
                    >
                      <img alt={poi.title} src={poi.thumbnail_url} />
                      <span className="rail-poi-copy">
                        <strong>{poi.title}</strong>
                        <span>{poi.category}</span>
                      </span>
                    </button>
                    <button
                      className="mini-button mini-button-primary"
                      disabled={busyAction === `go-${poi.poi_id}`}
                      onClick={() => onGoToPoi(poi.poi_id)}
                      type="button"
                    >
                      Go
                    </button>
                  </article>
                ))
              ) : (
                <div className="thread-empty">No POIs yet.</div>
              )}
            </div>
          )}
        </div>

        <div className="rail-composer">
          <input className="composer-input" disabled placeholder="Chat API not wired yet" />
          <button className="mini-button" disabled type="button">
            Send
          </button>
        </div>
      </div>
    </PanelShell>
  );
}
