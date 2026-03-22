import React from "react";

import { ChatState } from "./types";

const MAX_VISIBLE_TOOL_CHIPS = 2;

type ChatPanelProps = {
  chat: ChatState;
  onResetChat: () => void;
  onSubmitMessage: (message: string) => void;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type ChatToolSummaryProps = {
  messageId: string;
  toolsUsed: string[];
};

function ChatToolSummary(props: ChatToolSummaryProps): React.ReactElement {
  const { messageId, toolsUsed } = props;
  const [expanded, setExpanded] = React.useState(false);

  if (toolsUsed.length === 0) {
    return <></>;
  }

  const visibleTools = toolsUsed.slice(0, MAX_VISIBLE_TOOL_CHIPS);
  const hiddenCount = Math.max(0, toolsUsed.length - MAX_VISIBLE_TOOL_CHIPS);
  const tooltip = toolsUsed.join("\n");

  return (
    <div className="chat-tool-stack">
      <div className="chat-tool-row">
        {visibleTools.map((toolName) => (
          <span key={`${messageId}-${toolName}`}>{toolName}</span>
        ))}
        {hiddenCount > 0 ? (
          <button
            aria-expanded={expanded}
            className="chat-tool-more"
            onClick={() => {
              setExpanded((current) => !current);
            }}
            title={tooltip}
            type="button"
          >
            {expanded ? "Hide tools" : `… +${hiddenCount} more`}
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="chat-tool-expanded" title={tooltip}>
          {toolsUsed.map((toolName, index) => (
            <span key={`${messageId}-${toolName}-${index}`}>{toolName}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel(props: ChatPanelProps): React.ReactElement {
  const { chat, onResetChat, onSubmitMessage } = props;
  const [draft, setDraft] = React.useState("");
  const threadRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [chat.messages]);

  return (
    <section className="chat-shell">
      <div className="chat-thread" ref={threadRef}>
        {chat.messages.length > 0 ? (
          chat.messages.map((message) => (
            <article
              className={`chat-message role-${message.role} status-${message.status}`}
              key={message.message_id}
            >
              <div className="chat-message-meta">
                <strong>{message.role === "user" ? "You" : "Agent"}</strong>
                <time>{formatTime(message.created_at)}</time>
              </div>
              <p>{message.content || (message.status === "running" ? "Working..." : "No content")}</p>
              {message.tools_used.length > 0 ? (
                <ChatToolSummary
                  messageId={message.message_id}
                  toolsUsed={message.tools_used}
                />
              ) : null}
            </article>
          ))
        ) : (
          <div className="thread-empty">
            Ask about POIs, YOLO objects, the current view, or robot navigation.
          </div>
        )}
      </div>

      <form
        className="chat-compose"
        onSubmit={(event) => {
          event.preventDefault();
          const message = draft.trim();
          if (!message) {
            return;
          }
          onSubmitMessage(message);
          setDraft("");
        }}
      >
        <textarea
          disabled={chat.running}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Ask the agent about the map or command the robot..."
          rows={3}
          value={draft}
        />
        <div className="chat-compose-actions">
          <button className="mini-button" onClick={onResetChat} type="button">
            Reset
          </button>
          <button
            className="mini-button mini-button-primary"
            disabled={chat.running || draft.trim().length === 0}
            type="submit"
          >
            {chat.running ? "Thinking" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
