import React from "react";

import { ChatPanel } from "./ChatPanel";
import { PanelShell } from "./PanelShell";
import { ChatState, SemanticItem, SemanticItemRef, SemanticKind } from "./types";

type ActivityEntry = {
  id: string;
  role: "operator" | "system";
  tone: "neutral" | "accent" | "success" | "danger";
  title: string;
  detail: string;
  timestamp: string;
};

type RailView = "timeline" | "semantic" | "chat";

export type SelectedSemanticPreview = {
  kind: SemanticKind;
  entity_id: string;
  title: string;
  subtitle: string;
  summary: string;
  thumbnail_url: string;
};

type OperatorRailProps = {
  activityEntries: ActivityEntry[];
  busyAction: string | null;
  chat: ChatState;
  items: SemanticItem[];
  selectedItem: SemanticItemRef | null;
  selectedPreview: SelectedSemanticPreview | null;
  onSelectItem: (item: SemanticItemRef | null) => void;
  onHighlightItem: (item: SemanticItemRef) => void;
  onFocusItem: (item: SemanticItemRef) => void;
  onGoToItem: (item: SemanticItemRef) => void;
  onClearFocus: () => void;
  onResetChat: () => void;
  onSubmitChatMessage: (message: string) => void;
};

function itemLabel(kind: SemanticKind): string {
  return kind === "vlm_poi" ? "POI" : "YOLO";
}

export function OperatorRail(props: OperatorRailProps): React.ReactElement {
  const {
    activityEntries,
    busyAction,
    chat,
    items,
    selectedItem,
    selectedPreview,
    onSelectItem,
    onHighlightItem,
    onFocusItem,
    onGoToItem,
    onClearFocus,
    onResetChat,
    onSubmitChatMessage,
  } = props;

  const [railView, setRailView] = React.useState<RailView>("timeline");
  const visibleEntries = React.useMemo(() => activityEntries.slice(-8), [activityEntries]);

  return (
    <PanelShell
      aside={
        <div className="rail-tabs" role="tablist" aria-label="Operator rail views">
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
            className={railView === "semantic" ? "is-active" : ""}
            onClick={() => {
              setRailView("semantic");
            }}
            type="button"
          >
            Semantic
          </button>
          <button
            className={railView === "chat" ? "is-active" : ""}
            onClick={() => {
              setRailView("chat");
            }}
            type="button"
          >
            Agent
          </button>
        </div>
      }
      bodyClassName="panel-body-console"
      className="console-panel"
      kicker="Operator"
      title="Console"
    >
      <div className="rail-stack">
        {selectedPreview ? (
          <section className="rail-selected-card">
            <img alt={selectedPreview.title} src={selectedPreview.thumbnail_url} />
            <div className="rail-selected-copy">
              <div className="rail-selected-topline">
                <strong>{selectedPreview.title}</strong>
                <span>{selectedPreview.subtitle}</span>
              </div>
              <p>{selectedPreview.summary}</p>
            </div>
            <div className="rail-selected-actions">
              <button
                className="mini-button"
                onClick={() => onFocusItem({ kind: selectedPreview.kind, entity_id: selectedPreview.entity_id })}
                type="button"
              >
                Focus
              </button>
              <button
                className="mini-button"
                onClick={() =>
                  onHighlightItem({ kind: selectedPreview.kind, entity_id: selectedPreview.entity_id })
                }
                type="button"
              >
                Highlight
              </button>
              <button
                className="mini-button mini-button-primary"
                disabled={busyAction === `go-${selectedPreview.kind}-${selectedPreview.entity_id}`}
                onClick={() =>
                  onGoToItem({ kind: selectedPreview.kind, entity_id: selectedPreview.entity_id })
                }
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
          ) : railView === "semantic" ? (
            <div className="rail-poi-list">
              {items.length > 0 ? (
                items.map((item) => {
                  const isSelected =
                    selectedItem?.kind === item.kind && selectedItem?.entity_id === item.entity_id;
                  return (
                    <article className="rail-poi-item" key={`${item.kind}:${item.entity_id}`}>
                      <button
                        className={`rail-poi-main ${isSelected ? "is-active" : ""}`}
                        onClick={() => onSelectItem({ kind: item.kind, entity_id: item.entity_id })}
                        type="button"
                      >
                        <img alt={item.title} src={item.thumbnail_url} />
                        <span className="rail-poi-copy">
                          <strong>{item.title}</strong>
                          <span>
                            {itemLabel(item.kind)} · {item.subtitle}
                          </span>
                        </span>
                      </button>
                      <button
                        className="mini-button mini-button-primary"
                        disabled={busyAction === `go-${item.kind}-${item.entity_id}`}
                        onClick={() => onGoToItem({ kind: item.kind, entity_id: item.entity_id })}
                        type="button"
                      >
                        Go
                      </button>
                    </article>
                  );
                })
              ) : (
                <div className="thread-empty">No semantic anchors yet.</div>
              )}
            </div>
          ) : (
            <ChatPanel chat={chat} onResetChat={onResetChat} onSubmitMessage={onSubmitChatMessage} />
          )}
        </div>
      </div>
    </PanelShell>
  );
}
