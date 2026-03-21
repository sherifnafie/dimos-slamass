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

    async def chat_focus_semantic_item(
        self,
        *,
        kind: str,
        entity_id: str,
        zoom: float | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_highlight_semantic_items(
        self,
        *,
        items: list[dict[str, str]],
        selected_item: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_focus_map(self) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_focus_robot(self, *, zoom: float | None = None) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_clear_map_focus(self) -> dict[str, Any]:
        raise NotImplementedError

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

    async def chat_inspect_now(self) -> dict[str, Any]:
        raise NotImplementedError

    async def chat_look_current_view(self, *, query: str) -> dict[str, Any]:
        raise NotImplementedError

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
