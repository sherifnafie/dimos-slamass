import React from "react";

import { ChatState } from "./types";

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
              <div className="chat-message-body">
                <p>{message.content || (message.status === "running" ? "Working..." : "No content")}</p>
                {message.tools_used.length > 0 ? (
                  <div className="chat-tool-row">
                    {message.tools_used.map((toolName) => (
                      <span key={`${message.message_id}-${toolName}`}>{toolName}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="thread-empty">
            Ask about POIs, YOLO objects, current view, navigation, or map focus.
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
