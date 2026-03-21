import React from "react";

import { ChatToolDefinition } from "./types";

type AgentToolsModalProps = {
  error: string | null;
  loading: boolean;
  tools: ChatToolDefinition[] | null;
  onClose: () => void;
  onReload: () => void;
};

function renderParameterLabel(parameter: ChatToolDefinition["parameters"][number]): string {
  let label = `${parameter.name}: ${parameter.type}`;
  if (parameter.item_type) {
    label += ` of ${parameter.item_type}`;
  }
  if (parameter.enum && parameter.enum.length > 0) {
    label += ` (${parameter.enum.join(", ")})`;
  }
  if (!parameter.required) {
    label += " optional";
  }
  return label;
}

export function AgentToolsModal(props: AgentToolsModalProps): React.ReactElement {
  const { error, loading, tools, onClose, onReload } = props;

  return (
    <div
      className="dialog-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-labelledby="agent-tools-title"
        aria-modal="true"
        className="dialog-sheet agent-tools-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h3 id="agent-tools-title">Agent Tool Calls</h3>
          </div>
          <div className="dialog-header-actions">
            <button className="mini-button" onClick={onReload} type="button">
              Reload
            </button>
            <button className="close-button" onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>

        {loading ? (
          <div className="dialog-empty-state">Loading agent tools…</div>
        ) : error ? (
          <div className="dialog-empty-state dialog-empty-state-error">{error}</div>
        ) : tools && tools.length > 0 ? (
          <div className="agent-tools-list">
            {tools.map((tool) => (
              <article className="agent-tool-card" key={tool.name}>
                <div className="agent-tool-header">
                  <strong>{tool.name}</strong>
                </div>
                <p>{tool.description}</p>
                {tool.parameters.length > 0 ? (
                  <div className="agent-tool-parameters">
                    {tool.parameters.map((parameter) => (
                      <div className="agent-tool-parameter" key={`${tool.name}:${parameter.name}`}>
                        <span>{renderParameterLabel(parameter)}</span>
                        {parameter.description ? <small>{parameter.description}</small> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="agent-tool-no-parameters">No parameters</div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="dialog-empty-state">No tools exposed.</div>
        )}
      </div>
    </div>
  );
}
