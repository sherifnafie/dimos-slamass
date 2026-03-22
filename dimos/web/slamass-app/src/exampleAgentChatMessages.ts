import type { ChatMessage } from "./types";

/** Sample thread for empty Orchestrator chat — same shape as `/api/chat` messages. */
export const EXAMPLE_AGENT_CHAT_MESSAGES: ChatMessage[] = [
  {
    message_id: "example-user-describe-scene",
    role: "user",
    content: "Describe what you see right now",
    created_at: "2025-03-22T14:02:00.000Z",
    status: "done",
    tools_used: [],
  },
  {
    message_id: "example-assistant-scene",
    role: "assistant",
    content:
      "I'm facing the southwest corner of the lab. Here's what I see:\n\n" +
      "An open office area with a dark ergonomic chair in the foreground-left, a standing desk with a widescreen monitor behind it. Overhead fluorescent lighting, carpeted floor. Exit sign visible above glass door to the right.",
    created_at: "2025-03-22T14:02:08.000Z",
    status: "done",
    tools_used: ["chair 94%", "monitor 72%", "exit door (VLM)"],
  },
];

/** Shown under the example thread; each sends a real message when clicked. */
export const EXAMPLE_AGENT_SUGGESTION_PROMPTS: string[] = [
  "Go to the exit",
  "Turn around",
  "Describe again",
];
