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

from typing import Any

import pytest

from dimos.slamass.chat_agent import (
    ChatBackendResponse,
    ChatBackendToolCall,
    ChatMessage,
    SlamassChatAgent,
)


class FakeRuntime:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def chat_runtime_overview(self) -> dict[str, Any]:
        return {"connected": True}

    async def chat_search_semantic_memory(
        self,
        *,
        query: str,
        kind: str = "all",
        limit: int = 5,
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_get_semantic_item(self, *, kind: str, entity_id: str) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_ask_semantic_item_question(
        self,
        *,
        kind: str,
        entity_id: str,
        question: str,
    ) -> dict[str, Any]:
        self.calls.append(
            (
                "ask_semantic_item_question",
                {"kind": kind, "entity_id": entity_id, "question": question},
            )
        )
        return {"ok": True, "answer": "The boxing ring is blue."}

    async def chat_set_layer_visibility(
        self,
        *,
        show_pois: bool | None = None,
        show_yolo: bool | None = None,
    ) -> dict[str, Any]:
        self.calls.append(
            (
                "set_layer_visibility",
                {"show_pois": show_pois, "show_yolo": show_yolo},
            )
        )
        return {"ok": True}

    async def chat_set_yolo_runtime(self, *, mode: str) -> dict[str, Any]:
        self.calls.append(("set_yolo_runtime", {"mode": mode}))
        return {"ok": True}

    async def chat_save_map(self) -> dict[str, Any]:
        self.calls.append(("save_map", {}))
        return {"ok": True, "saved": True}

    async def chat_go_to_semantic_item(self, *, kind: str, entity_id: str) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_cancel_current_action(self) -> dict[str, Any]:
        self.calls.append(("cancel_current_action", {}))
        return {"ok": True, "cancelled": True}

    async def chat_inspect_now(self) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_look_current_view(self, *, query: str) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_speak_text(self, *, text: str) -> dict[str, Any]:
        self.calls.append(("speak_text", {"text": text}))
        return {"ok": True, "result": f"Spoke: {text}"}

    async def chat_relative_move(
        self,
        *,
        forward: float = 0.0,
        left: float = 0.0,
        degrees: float = 0.0,
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_wait(self, *, seconds: float) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_execute_sport_command(self, *, command_name: str) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_list_sport_commands(self) -> dict[str, Any]:
        raise NotImplementedError


class SequentialBackend:
    def __init__(self) -> None:
        self.calls = 0

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ChatBackendResponse:
        self.calls += 1
        if self.calls == 1:
            return ChatBackendResponse(
                content="",
                tool_calls=[
                    ChatBackendToolCall(
                        call_id="call_layers",
                        name="set_layer_visibility",
                        arguments_json='{"show_pois": true, "show_yolo": false}',
                    ),
                    ChatBackendToolCall(
                        call_id="call_yolo",
                        name="set_yolo_runtime",
                        arguments_json='{"mode": "paused"}',
                    ),
                    ChatBackendToolCall(
                        call_id="call_save",
                        name="save_map",
                        arguments_json="{}",
                    ),
                ],
            )
        return ChatBackendResponse(content="Updated the map view and saved the map.", tool_calls=[])


class SpeakBackend:
    def __init__(self) -> None:
        self.calls = 0

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ChatBackendResponse:
        self.calls += 1
        if self.calls == 1:
            return ChatBackendResponse(
                content="",
                tool_calls=[
                    ChatBackendToolCall(
                        call_id="call_speak",
                        name="speak_text",
                        arguments_json='{"text": "Hello from SLAMASS."}',
                    )
                ],
            )
        return ChatBackendResponse(content="I announced it over the speaker.", tool_calls=[])


class NavigationBackend:
    def __init__(self) -> None:
        self.calls = 0

    def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ChatBackendResponse:
        self.calls += 1
        if self.calls == 1:
            return ChatBackendResponse(
                content="",
                tool_calls=[
                    ChatBackendToolCall(
                        call_id="call_qa",
                        name="ask_semantic_item_question",
                        arguments_json='{"kind": "vlm_poi", "entity_id": "poi-1", "question": "What color is the boxing ring?"}',
                    ),
                    ChatBackendToolCall(
                        call_id="call_cancel",
                        name="cancel_current_action",
                        arguments_json="{}",
                    ),
                ],
            )
        return ChatBackendResponse(content="I checked the saved POI and cancelled the action.", tool_calls=[])


@pytest.mark.asyncio
async def test_chat_agent_dispatches_layer_and_save_tools() -> None:
    agent = SlamassChatAgent(backend=SequentialBackend())
    runtime = FakeRuntime()

    result = await agent.run_turn(
        runtime,
        history=[
            ChatMessage(
                message_id="u1",
                role="user",
                content="Prepare the map for the presenter.",
                created_at="2026-03-21T00:00:00Z",
            )
        ],
        user_message="Show just VLM, pause YOLO, and save the map.",
    )

    assert result.content == "Updated the map view and saved the map."
    assert result.tools_used == ["set_layer_visibility", "set_yolo_runtime", "save_map"]
    assert runtime.calls == [
        ("set_layer_visibility", {"show_pois": True, "show_yolo": False}),
        ("set_yolo_runtime", {"mode": "paused"}),
        ("save_map", {}),
    ]


@pytest.mark.asyncio
async def test_chat_agent_dispatches_speak_tool() -> None:
    agent = SlamassChatAgent(backend=SpeakBackend())
    runtime = FakeRuntime()

    result = await agent.run_turn(
        runtime,
        history=[],
        user_message="Ask the robot to greet the room.",
    )

    assert result.content == "I announced it over the speaker."
    assert result.tools_used == ["speak_text"]
    assert runtime.calls == [("speak_text", {"text": "Hello from SLAMASS."})]


@pytest.mark.asyncio
async def test_chat_agent_dispatches_saved_item_qa_and_cancel_tool() -> None:
    agent = SlamassChatAgent(backend=NavigationBackend())
    runtime = FakeRuntime()

    result = await agent.run_turn(
        runtime,
        history=[],
        user_message="Check the boxing ring POI and stop the current action.",
    )

    assert result.content == "I checked the saved POI and cancelled the action."
    assert result.tools_used == ["ask_semantic_item_question", "cancel_current_action"]
    assert runtime.calls == [
        (
            "ask_semantic_item_question",
            {
                "kind": "vlm_poi",
                "entity_id": "poi-1",
                "question": "What color is the boxing ring?",
            },
        ),
        ("cancel_current_action", {}),
    ]


def test_chat_agent_tool_manifest_matches_scoped_surface() -> None:
    agent = SlamassChatAgent(backend=SequentialBackend())

    manifest = agent.tool_manifest()
    tool_names = [tool["name"] for tool in manifest]

    assert tool_names == [
        "get_runtime_overview",
        "search_semantic_memory",
        "get_semantic_item",
        "ask_semantic_item_question",
        "set_layer_visibility",
        "set_yolo_runtime",
        "save_map",
        "go_to_semantic_item",
        "cancel_current_action",
        "inspect_now",
        "look_current_view",
        "speak_text",
    ]
    assert "relative_move" not in tool_names
    assert "wait" not in tool_names
    assert "execute_sport_command" not in tool_names
