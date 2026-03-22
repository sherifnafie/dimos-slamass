import { ArrowRightIcon } from "@heroicons/react/24/solid";
import React from "react";

import type { ChatMessage, ChatState } from "./types";

type ChatPanelProps = {
  chat: ChatState;
  onResetChat: () => void;
  onSubmitMessage: (message: string) => void;
  /** When the live thread is empty, show these using the same message chrome (e.g. onboarding). */
  exampleWhenEmpty?: ChatMessage[];
  /** Optional chips under the example; each calls `onSubmitMessage` with the label text. */
  exampleSuggestionPrompts?: string[];
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

function ChatMessageArticle(props: { message: ChatMessage }): React.ReactElement {
  const { message } = props;
  const bodyText =
    message.content || (message.status === "running" ? "Working..." : "No content");
  return (
    <article className={`chat-message role-${message.role} status-${message.status}`}>
      <div className="chat-message-meta">
        <div className="chat-message-meta-start">
          <strong>{message.role === "user" ? "You" : "Agent"}</strong>
        </div>
        <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
      </div>
      <div className="chat-message-body">
        <p>{bodyText}</p>
        {message.tools_used.length > 0 ? (
          <div className="chat-tool-row">
            {message.tools_used.map((toolName) => (
              <span key={`${message.message_id}-${toolName}`}>{toolName}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ChatPanel(props: ChatPanelProps): React.ReactElement {
  const {
    chat,
    onResetChat,
    onSubmitMessage,
    exampleWhenEmpty,
    exampleSuggestionPrompts,
  } = props;
  const [draft, setDraft] = React.useState("");
  const threadRef = React.useRef<HTMLDivElement>(null);

  const showingExample =
    !chat.running &&
    chat.messages.length === 0 &&
    exampleWhenEmpty !== undefined &&
    exampleWhenEmpty.length > 0;

  React.useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [chat.messages, showingExample]);

  return (
    <section className="chat-shell">
      <div className="chat-thread" ref={threadRef}>
        {chat.messages.length > 0 ? (
          chat.messages.map((message) => (
            <ChatMessageArticle key={message.message_id} message={message} />
          ))
        ) : showingExample ? (
          <div className="chat-example-block" role="region" aria-label="Example conversation">
            {(exampleWhenEmpty ?? []).map((message) => (
              <ChatMessageArticle key={message.message_id} message={message} />
            ))}
            {exampleSuggestionPrompts !== undefined && exampleSuggestionPrompts.length > 0 ? (
              <div
                aria-label="Example follow-up prompts"
                className="chat-example-suggestions"
                role="group"
              >
                {exampleSuggestionPrompts.map((label) => (
                  <button
                    className="chat-example-suggestion"
                    key={label}
                    type="button"
                    onClick={() => {
                      onSubmitMessage(label);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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
        <div className="chat-compose-bar">
          <textarea
            className="chat-compose-input"
            disabled={chat.running}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) {
                return;
              }
              event.preventDefault();
              if (chat.running || draft.trim().length === 0) {
                return;
              }
              onSubmitMessage(draft.trim());
              setDraft("");
            }}
            placeholder="Command…"
            rows={1}
            value={draft}
          />
          <button
            aria-busy={chat.running}
            aria-label={chat.running ? "Agent is thinking" : "Send message"}
            className="chat-compose-send"
            disabled={chat.running || draft.trim().length === 0}
            type="submit"
          >
            <ArrowRightIcon aria-hidden className="chat-compose-send-icon" />
          </button>
        </div>
        <div className="chat-compose-footer">
          <button className="chat-compose-reset" onClick={onResetChat} type="button">
            Reset chat
          </button>
        </div>
      </form>
    </section>
  );
}
