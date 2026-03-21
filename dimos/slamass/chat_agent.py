# Copyright 2025-2026 Dimensional Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import json
import os
from typing import Any, Protocol

from openai import OpenAI


SYSTEM_PROMPT = """You are the SLAMASS operator agent for a live robotics demo.

You help the user through the SLAMASS chat UI. You can reason over:
- saved semantic memory from VLM POIs and YOLO objects
- map and UI controls for focus, highlight, and camera movement
- robot capabilities exposed through curated tools

Operating rules:
- For "where is ..." or "find ..." questions, search semantic memory first.
- When answering a spatial question, usually also drive the UI so the operator can see the result:
  - focus or highlight the most relevant semantic item(s)
  - focus the map or robot when useful
- If a relevant layer is hidden, turn it on before trying to present the result.
- Prefer go_to_semantic_item for meaningful destinations.
- Use relative_move only for small local adjustments or when the user explicitly asks for relative motion.
- Use inspect_now when the user asks to inspect, refresh, or capture the current place.
- Use look_current_view when the question is about what the robot sees right now or when the saved map memory is insufficient.
- Use set_yolo_runtime only when the user asks to pause or resume live YOLO labeling.
- Use save_map only when the user explicitly asks to save or checkpoint the current SLAMASS map.
- If the result is ambiguous, highlight the best candidates and ask one short clarification question.
- Do not delete semantic items unless the user explicitly asks.
- Do not use stop or teleop controls. Those are outside your authority.
- Keep responses concise, concrete, and presenter-friendly.
- If you took actions, say what you did briefly.
"""

MAX_HISTORY_MESSAGES = 12
MAX_TOOL_ROUNDS = 8


@dataclass(slots=True)
class ChatMessage:
    message_id: str
    role: str
    content: str
    created_at: str
    status: str = "final"
    tools_used: list[str] | None = None


@dataclass(slots=True)
class ChatTurnResult:
    content: str
    tools_used: list[str]


@dataclass(slots=True)
class ChatBackendToolCall:
    call_id: str
    name: str
    arguments_json: str


@dataclass(slots=True)
class ChatBackendResponse:
    content: str
    tool_calls: list[ChatBackendToolCall]


class ChatRuntime(Protocol):
    async def chat_runtime_overview(self) -> dict[str, Any]: ...

    async def chat_search_semantic_memory(
        self,
        *,
        query: str,
        kind: str = "all",
        limit: int = 5,
    ) -> dict[str, Any]: ...

    async def chat_get_semantic_item(self, *, kind: str, entity_id: str) -> dict[str, Any]: ...

    async def chat_focus_semantic_item(
        self,
        *,
        kind: str,
        entity_id: str,
        zoom: float | None = None,
    ) -> dict[str, Any]: ...

    async def chat_highlight_semantic_items(
        self,
        *,
        items: list[dict[str, str]],
        selected_item: dict[str, str] | None = None,
    ) -> dict[str, Any]: ...

    async def chat_focus_map(self) -> dict[str, Any]: ...

    async def chat_focus_robot(self, *, zoom: float | None = None) -> dict[str, Any]: ...

    async def chat_clear_map_focus(self) -> dict[str, Any]: ...

    async def chat_set_layer_visibility(
        self,
        *,
        show_pois: bool | None = None,
        show_yolo: bool | None = None,
    ) -> dict[str, Any]: ...

    async def chat_set_yolo_runtime(self, *, mode: str) -> dict[str, Any]: ...

    async def chat_save_map(self) -> dict[str, Any]: ...

    async def chat_go_to_semantic_item(self, *, kind: str, entity_id: str) -> dict[str, Any]: ...

    async def chat_inspect_now(self) -> dict[str, Any]: ...

    async def chat_look_current_view(self, *, query: str) -> dict[str, Any]: ...

    async def chat_relative_move(
        self,
        *,
        forward: float = 0.0,
        left: float = 0.0,
        degrees: float = 0.0,
    ) -> dict[str, Any]: ...

    async def chat_wait(self, *, seconds: float) -> dict[str, Any]: ...

    async def chat_execute_sport_command(self, *, command_name: str) -> dict[str, Any]: ...

    async def chat_list_sport_commands(self) -> dict[str, Any]: ...


class ChatBackend(Protocol):
    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ChatBackendResponse: ...


class OpenAIChatBackend:
    def __init__(self, model_name: str = "gpt-5.4") -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OpenAI API key must be provided or set in OPENAI_API_KEY environment variable"
            )
        self._client = OpenAI(api_key=api_key)
        self.model_name = model_name

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ChatBackendResponse:
        response = self._client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            tools=tools,
            temperature=0.2,
        )
        choice = response.choices[0].message
        tool_calls = [
            ChatBackendToolCall(
                call_id=tool_call.id,
                name=tool_call.function.name,
                arguments_json=tool_call.function.arguments or "{}",
            )
            for tool_call in (choice.tool_calls or [])
        ]
        return ChatBackendResponse(content=choice.content or "", tool_calls=tool_calls)


class SlamassChatAgent:
    def __init__(
        self,
        *,
        backend: ChatBackend | None = None,
        model_name: str = "gpt-5.4",
    ) -> None:
        self._backend = backend or OpenAIChatBackend(model_name=model_name)
        self._tools = self._build_tools()

    async def run_turn(
        self,
        runtime: ChatRuntime,
        *,
        history: list[ChatMessage],
        user_message: str,
    ) -> ChatTurnResult:
        messages: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
        overview = await runtime.chat_runtime_overview()
        messages.append(
            {
                "role": "system",
                "content": "Current SLAMASS runtime overview:\n" + json.dumps(overview, ensure_ascii=True),
            }
        )

        for message in history[-MAX_HISTORY_MESSAGES:]:
            messages.append({"role": message.role, "content": message.content})
        messages.append({"role": "user", "content": user_message})

        tools_used: list[str] = []

        for _ in range(MAX_TOOL_ROUNDS):
            backend_response = await asyncio.to_thread(self._backend.complete, messages, self._tools)

            assistant_message: dict[str, Any] = {
                "role": "assistant",
                "content": backend_response.content or "",
            }
            if backend_response.tool_calls:
                assistant_message["tool_calls"] = [
                    {
                        "id": call.call_id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": call.arguments_json,
                        },
                    }
                    for call in backend_response.tool_calls
                ]
            messages.append(assistant_message)

            if not backend_response.tool_calls:
                content = backend_response.content.strip()
                if not content:
                    content = "I could not complete that request."
                return ChatTurnResult(content=content, tools_used=tools_used)

            for tool_call in backend_response.tool_calls:
                tool_result = await self._execute_tool(runtime, tool_call)
                tools_used.append(tool_call.name)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.call_id,
                        "content": json.dumps(tool_result, ensure_ascii=True),
                    }
                )

        return ChatTurnResult(
            content="I hit my tool-use limit before finishing. Please try a narrower request.",
            tools_used=tools_used,
        )

    async def _execute_tool(
        self,
        runtime: ChatRuntime,
        tool_call: ChatBackendToolCall,
    ) -> dict[str, Any]:
        try:
            arguments = json.loads(tool_call.arguments_json or "{}")
        except json.JSONDecodeError as exc:
            return {"ok": False, "error": f"Invalid tool arguments: {exc}"}
        if not isinstance(arguments, dict):
            return {"ok": False, "error": "Tool arguments must be a JSON object"}

        try:
            if tool_call.name == "get_runtime_overview":
                return await runtime.chat_runtime_overview()
            if tool_call.name == "search_semantic_memory":
                return await runtime.chat_search_semantic_memory(
                    query=str(arguments.get("query", "")),
                    kind=str(arguments.get("kind", "all")),
                    limit=int(arguments.get("limit", 5)),
                )
            if tool_call.name == "get_semantic_item":
                return await runtime.chat_get_semantic_item(
                    kind=str(arguments.get("kind", "")),
                    entity_id=str(arguments.get("entity_id", "")),
                )
            if tool_call.name == "focus_semantic_item":
                zoom = arguments.get("zoom")
                return await runtime.chat_focus_semantic_item(
                    kind=str(arguments.get("kind", "")),
                    entity_id=str(arguments.get("entity_id", "")),
                    zoom=float(zoom) if zoom is not None else None,
                )
            if tool_call.name == "highlight_semantic_items":
                raw_items = arguments.get("items", [])
                items = [item for item in raw_items if isinstance(item, dict)]
                selected_item = arguments.get("selected_item")
                return await runtime.chat_highlight_semantic_items(
                    items=[{"kind": str(item.get("kind", "")), "entity_id": str(item.get("entity_id", ""))} for item in items],
                    selected_item=(
                        {
                            "kind": str(selected_item.get("kind", "")),
                            "entity_id": str(selected_item.get("entity_id", "")),
                        }
                        if isinstance(selected_item, dict)
                        else None
                    ),
                )
            if tool_call.name == "focus_map":
                return await runtime.chat_focus_map()
            if tool_call.name == "focus_robot":
                zoom = arguments.get("zoom")
                return await runtime.chat_focus_robot(zoom=float(zoom) if zoom is not None else None)
            if tool_call.name == "clear_map_focus":
                return await runtime.chat_clear_map_focus()
            if tool_call.name == "set_layer_visibility":
                show_pois = arguments.get("show_pois")
                show_yolo = arguments.get("show_yolo")
                return await runtime.chat_set_layer_visibility(
                    show_pois=bool(show_pois) if show_pois is not None else None,
                    show_yolo=bool(show_yolo) if show_yolo is not None else None,
                )
            if tool_call.name == "set_yolo_runtime":
                return await runtime.chat_set_yolo_runtime(mode=str(arguments.get("mode", "")))
            if tool_call.name == "save_map":
                return await runtime.chat_save_map()
            if tool_call.name == "go_to_semantic_item":
                return await runtime.chat_go_to_semantic_item(
                    kind=str(arguments.get("kind", "")),
                    entity_id=str(arguments.get("entity_id", "")),
                )
            if tool_call.name == "inspect_now":
                return await runtime.chat_inspect_now()
            if tool_call.name == "look_current_view":
                return await runtime.chat_look_current_view(query=str(arguments.get("query", "")))
            if tool_call.name == "relative_move":
                return await runtime.chat_relative_move(
                    forward=float(arguments.get("forward", 0.0)),
                    left=float(arguments.get("left", 0.0)),
                    degrees=float(arguments.get("degrees", 0.0)),
                )
            if tool_call.name == "wait":
                return await runtime.chat_wait(seconds=float(arguments.get("seconds", 0.0)))
            if tool_call.name == "execute_sport_command":
                return await runtime.chat_execute_sport_command(
                    command_name=str(arguments.get("command_name", "")),
                )
            if tool_call.name == "list_sport_commands":
                return await runtime.chat_list_sport_commands()
        except Exception as exc:
            return {"ok": False, "error": str(exc), "tool": tool_call.name}

        return {"ok": False, "error": f"Unknown tool: {tool_call.name}"}

    def _build_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "get_runtime_overview",
                    "description": "Get high-level SLAMASS runtime state: connectivity, robot pose, counts, active layers, and UI focus state.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search_semantic_memory",
                    "description": "Search saved VLM POIs and YOLO objects by natural language. Use this first for object and location questions.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                            "kind": {
                                "type": "string",
                                "enum": ["all", "vlm_poi", "yolo_object"],
                            },
                            "limit": {"type": "integer", "minimum": 1, "maximum": 8},
                        },
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_semantic_item",
                    "description": "Get full details for one semantic item after search identifies a candidate.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": ["vlm_poi", "yolo_object"],
                            },
                            "entity_id": {"type": "string"},
                        },
                        "required": ["kind", "entity_id"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "focus_semantic_item",
                    "description": "Move the SLAMASS map camera to a semantic item and select it in the UI.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": ["vlm_poi", "yolo_object"],
                            },
                            "entity_id": {"type": "string"},
                            "zoom": {"type": "number"},
                        },
                        "required": ["kind", "entity_id"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "highlight_semantic_items",
                    "description": "Highlight one or more semantic items in the UI. Use this for ambiguity handling or when presenting multiple relevant results.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "items": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "kind": {
                                            "type": "string",
                                            "enum": ["vlm_poi", "yolo_object"],
                                        },
                                        "entity_id": {"type": "string"},
                                    },
                                    "required": ["kind", "entity_id"],
                                    "additionalProperties": False,
                                },
                            },
                            "selected_item": {
                                "type": "object",
                                "properties": {
                                    "kind": {
                                        "type": "string",
                                        "enum": ["vlm_poi", "yolo_object"],
                                    },
                                    "entity_id": {"type": "string"},
                                },
                                "required": ["kind", "entity_id"],
                                "additionalProperties": False,
                            },
                        },
                        "required": ["items"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "focus_map",
                    "description": "Fit the SLAMASS map in view.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "focus_robot",
                    "description": "Center the SLAMASS map on the current robot pose.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "zoom": {"type": "number"},
                        },
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "clear_map_focus",
                    "description": "Clear map highlights and selection.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "set_layer_visibility",
                    "description": "Show or hide the VLM POI layer and the YOLO object layer in the SLAMASS UI.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "show_pois": {"type": "boolean"},
                            "show_yolo": {"type": "boolean"},
                        },
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "set_yolo_runtime",
                    "description": "Pause or resume live YOLO ingestion in SLAMASS.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "mode": {
                                "type": "string",
                                "enum": ["live", "paused"],
                            },
                        },
                        "required": ["mode"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "save_map",
                    "description": "Save the current SLAMASS map to persistent storage.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "go_to_semantic_item",
                    "description": "Navigate the robot to the saved viewpoint pose for a POI or YOLO object.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": ["vlm_poi", "yolo_object"],
                            },
                            "entity_id": {"type": "string"},
                        },
                        "required": ["kind", "entity_id"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "inspect_now",
                    "description": "Run a manual VLM inspection at the robot's current pose.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "look_current_view",
                    "description": "Ask a question about the robot's current live camera view.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string"},
                        },
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "relative_move",
                    "description": "Move the robot relative to its current pose. Use for small adjustments only.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "forward": {"type": "number"},
                            "left": {"type": "number"},
                            "degrees": {"type": "number"},
                        },
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "wait",
                    "description": "Pause for a number of seconds while carrying out a sequence.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "seconds": {"type": "number", "minimum": 0},
                        },
                        "required": ["seconds"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "list_sport_commands",
                    "description": "List the named Unitree sport commands available for execute_sport_command.",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "execute_sport_command",
                    "description": "Run a named Unitree sport command after list_sport_commands confirms the command name.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command_name": {"type": "string"},
                        },
                        "required": ["command_name"],
                        "additionalProperties": False,
                    },
                },
            },
        ]


__all__ = [
    "ChatBackend",
    "ChatBackendResponse",
    "ChatBackendToolCall",
    "ChatMessage",
    "ChatRuntime",
    "ChatTurnResult",
    "OpenAIChatBackend",
    "SlamassChatAgent",
]
