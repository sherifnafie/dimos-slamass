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

import asyncio
from pathlib import Path

import cv2
import numpy as np
import pytest

from dimos.slamass.map_memory import RawCostmap
from dimos.slamass.chat_agent import ChatTurnResult
from dimos.slamass.service import (
    InspectionAnalysis,
    OpenAIInspectionAnalyzer,
    RobotPose,
    SlamassService,
)
from dimos.slamass.storage import SlamassStorage


class FakeMcpClient:
    def __init__(self, image_bytes: bytes) -> None:
        self._image_bytes = image_bytes
        self.relative_move_calls: list[tuple[float, float, float]] = []
        self.set_yolo_inference_calls: list[bool] = []

    def observe_jpeg(self) -> bytes:
        return self._image_bytes

    async def relative_move(
        self, *, forward: float = 0.0, left: float = 0.0, degrees: float = 0.0
    ) -> dict[str, str]:
        self.relative_move_calls.append((forward, left, degrees))
        return {"status": "ok"}

    async def set_yolo_inference(self, *, enabled: bool) -> str:
        self.set_yolo_inference_calls.append(enabled)
        return f"YOLO inference {'enabled' if enabled else 'disabled'}."


class FakeMapClient:
    def __init__(self) -> None:
        self.calls: list[tuple[float, float, float | None]] = []
        self.move_calls: list[dict[str, float]] = []

    async def emit_click(self, x: float, y: float, yaw: float | None = None) -> None:
        self.calls.append((x, y, yaw))

    async def emit_move_command(
        self,
        *,
        linear_x: float = 0.0,
        linear_y: float = 0.0,
        linear_z: float = 0.0,
        angular_x: float = 0.0,
        angular_y: float = 0.0,
        angular_z: float = 0.0,
    ) -> None:
        self.move_calls.append(
            {
                "linear_x": linear_x,
                "linear_y": linear_y,
                "linear_z": linear_z,
                "angular_x": angular_x,
                "angular_y": angular_y,
                "angular_z": angular_z,
            }
        )


class FakeAnalyzer:
    def __init__(self, should_create_poi: bool = True, title: str = "Window Bay") -> None:
        self.should_create_poi = should_create_poi
        self.title = title

    def analyze(self, image) -> InspectionAnalysis:  # type: ignore[no-untyped-def]
        return InspectionAnalysis(
            title=self.title,
            summary="A bright area with a notable exterior window.",
            category="window",
            interest_score=0.83,
            should_create_poi=self.should_create_poi,
            gate_reason="clear spatial landmark" if self.should_create_poi else "too generic",
            objects=["window", "light"],
        )


class FakeChatAgent:
    def __init__(self, content: str = "I focused the best match on the map.") -> None:
        self.content = content
        self.calls: list[tuple[str, int]] = []

    async def run_turn(self, runtime, *, history, user_message):  # type: ignore[no-untyped-def]
        self.calls.append((user_message, len(history)))
        return ChatTurnResult(content=self.content, tools_used=["search_semantic_memory", "focus_semantic_item"])


def make_test_jpeg() -> bytes:
    image = np.zeros((90, 160, 3), dtype=np.uint8)
    image[:, :, 0] = 30
    image[:, :, 1] = 180
    image[:, :, 2] = 240
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def test_openai_inspection_analyzer_uses_slamass_default_model() -> None:
    analyzer = OpenAIInspectionAnalyzer()

    assert analyzer._vlm.config.model_name == "gpt-5.4-mini"


@pytest.mark.asyncio
async def test_service_inspect_now_creates_and_dedupes_poi(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(should_create_poi=True, title="Window Bay"),
    )
    service.robot_pose = RobotPose(x=1.0, y=2.0, z=0.0, yaw=0.2)

    result_one = await service.inspect_now()
    result_two = await service.inspect_now()

    assert result_one["status"] == "accepted"
    assert result_two["status"] == "accepted"
    assert len(storage.list_pois()) == 1
    assert len(service.pois) == 1


@pytest.mark.asyncio
async def test_service_inspect_now_rejects_without_creating_poi(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(should_create_poi=False),
    )
    service.robot_pose = RobotPose(x=0.0, y=0.0, z=0.0, yaw=0.0)

    result = await service.inspect_now()

    assert result["status"] == "rejected"
    assert storage.list_pois() == []


@pytest.mark.asyncio
async def test_service_manual_inspection_override_creates_poi(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(should_create_poi=False, title="Office Corner"),
    )
    service.robot_pose = RobotPose(x=0.0, y=0.0, z=0.0, yaw=0.0)

    settings = await service.set_manual_inspection_mode("always_create")
    result = await service.inspect_now()

    assert settings["manual_mode"] == "always_create"
    assert result["status"] == "accepted"
    assert result["manual_mode"] == "always_create"
    assert len(storage.list_pois()) == 1
    assert service.inspection_state["message"].startswith("Saved by manual override.")


@pytest.mark.asyncio
async def test_service_persists_active_map(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )

    await service._handle_raw_costmap(
        RawCostmap(
            grid=np.full((3, 3), 100, dtype=np.int8),
            origin_x=0.0,
            origin_y=0.0,
            resolution=0.05,
            ts=0.0,
        )
    )

    saved = await service.save_map()
    snapshot = await service.snapshot()

    assert saved["saved"] is True
    assert snapshot["map"] is not None
    assert (tmp_path / "maps" / "active_map.npz").exists()
    assert (tmp_path / "maps" / "active_map.png").exists()


@pytest.mark.asyncio
async def test_service_clear_low_level_map_memory_preserves_semantics(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )

    await service._handle_raw_costmap(
        RawCostmap(
            grid=np.full((4, 4), 100, dtype=np.int8),
            origin_x=0.0,
            origin_y=0.0,
            resolution=0.05,
            ts=0.0,
        )
    )

    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    poi = storage.new_poi(
        map_id="active",
        world_x=0.5,
        world_y=0.5,
        world_yaw=0.0,
        title="Desk",
        summary="Desk landmark",
        category="desk",
        interest_score=0.7,
        thumbnail_path=thumb,
        hero_image_path=hero,
        objects=["desk"],
    )
    storage.upsert_poi(poi)
    service.pois[poi.poi_id] = poi

    result = await service.clear_low_level_map_memory()

    assert result == {"cleared": True, "scope": "low_level_map"}
    assert service.map_state is None
    assert service.path == []
    assert storage.load_active_map() == (None, None, None)
    assert (tmp_path / "maps" / "active_map.npz").exists() is False
    assert (tmp_path / "maps" / "active_map.png").exists() is False
    assert service.pois[poi.poi_id].title == "Desk"


@pytest.mark.asyncio
async def test_service_clear_semantic_memory_preserves_low_level_map(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )

    await service._handle_raw_costmap(
        RawCostmap(
            grid=np.full((4, 4), 100, dtype=np.int8),
            origin_x=0.0,
            origin_y=0.0,
            resolution=0.05,
            ts=0.0,
        )
    )

    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    poi = storage.new_poi(
        map_id="active",
        world_x=0.5,
        world_y=0.5,
        world_yaw=0.0,
        title="Desk",
        summary="Desk landmark",
        category="desk",
        interest_score=0.7,
        thumbnail_path=thumb,
        hero_image_path=hero,
        objects=["desk"],
    )
    storage.upsert_poi(poi)
    service.pois[poi.poi_id] = poi

    yolo = storage.new_yolo_object(
        map_id="active",
        label="chair",
        class_id=56,
        world_x=0.25,
        world_y=0.35,
        world_z=0.0,
        size_x=0.4,
        size_y=0.4,
        size_z=0.8,
        best_view_x=0.25,
        best_view_y=0.2,
        best_view_yaw=0.0,
        thumbnail_path=thumb,
        hero_image_path=hero,
        detections_count=4,
        best_confidence=0.88,
    )
    storage.upsert_yolo_object(yolo)
    service.yolo_objects[yolo.object_id] = yolo
    await service.select_poi(poi.poi_id)

    result = await service.clear_semantic_memory()

    assert result == {"cleared": True, "scope": "semantic_memory"}
    assert service.map_state is not None
    assert service.pois == {}
    assert service.yolo_objects == {}
    assert storage.list_pois() == []
    assert storage.list_yolo_objects() == []
    assert service.ui_state.selected_item is None
    assert service.ui_state.highlighted_items == []


@pytest.mark.asyncio
async def test_service_loads_persisted_inspection_settings(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    storage.save_json_setting("inspection_settings", {"manual_mode": "always_create"})
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )

    service._load_from_storage()
    snapshot = await service.snapshot()

    assert snapshot["inspection_settings"]["manual_mode"] == "always_create"


@pytest.mark.asyncio
async def test_service_go_to_poi_uses_stored_view_pose(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    fake_mcp = FakeMcpClient(make_test_jpeg())
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=fake_mcp,
        analyzer=FakeAnalyzer(),
        poi_arrival_settle_seconds=0.0,
    )
    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    poi = storage.new_poi(
        map_id="active",
        world_x=1.25,
        world_y=-0.75,
        world_yaw=0.6,
        title="Window Nook",
        summary="A bright nook with a large window.",
        category="window",
        interest_score=0.9,
        thumbnail_path=thumb,
        hero_image_path=hero,
        objects=["window"],
    )
    storage.upsert_poi(poi)
    service.pois[poi.poi_id] = poi
    service.robot_pose = RobotPose(x=poi.world_x, y=poi.world_y, z=0.0, yaw=0.1)
    fake_map_client = FakeMapClient()
    service.map_client = fake_map_client  # type: ignore[assignment]

    await service.go_to_poi(poi.poi_id)
    assert service._goto_poi_task is not None
    await asyncio.wait_for(service._goto_poi_task, timeout=1.0)

    assert fake_map_client.calls == [(1.25, -0.75, None)]
    assert fake_mcp.relative_move_calls == [(0.0, 0.0, pytest.approx(28.64788975654116))]


@pytest.mark.asyncio
async def test_service_focus_poi_updates_ui_state(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )
    await service._handle_raw_costmap(
        RawCostmap(
            grid=np.full((3, 3), 100, dtype=np.int8),
            origin_x=0.0,
            origin_y=0.0,
            resolution=0.05,
            ts=0.0,
        )
    )
    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    poi = storage.new_poi(
        map_id="active",
        world_x=1.25,
        world_y=-0.75,
        world_yaw=0.6,
        title="Window Nook",
        summary="A bright nook with a large window.",
        category="window",
        interest_score=0.9,
        thumbnail_path=thumb,
        hero_image_path=hero,
        objects=["window"],
    )
    storage.upsert_poi(poi)
    service.pois[poi.poi_id] = poi

    ui = await service.focus_poi(poi.poi_id, zoom=2.8)
    assert service.map_state is not None
    max_x = service.map_state.origin_x + service.map_state.width * service.map_state.resolution
    min_y = service.map_state.origin_y

    assert ui["selected_item"] == {"kind": "vlm_poi", "entity_id": poi.poi_id}
    assert ui["highlighted_items"] == [{"kind": "vlm_poi", "entity_id": poi.poi_id}]
    assert ui["camera"]["center_x"] == pytest.approx(max_x)
    assert ui["camera"]["center_y"] == pytest.approx(min_y)
    assert ui["camera"]["zoom"] == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_service_delete_poi_clears_ui_focus(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )
    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    poi = storage.new_poi(
        map_id="active",
        world_x=1.0,
        world_y=2.0,
        world_yaw=0.1,
        title="Window Nook",
        summary="A bright nook with a large window.",
        category="window",
        interest_score=0.9,
        thumbnail_path=thumb,
        hero_image_path=hero,
        objects=["window", "chair"],
    )
    storage.upsert_poi(poi)
    service.pois[poi.poi_id] = poi
    await service.highlight_pois([poi.poi_id], selected_poi_id=poi.poi_id)

    await service.delete_poi(poi.poi_id)

    assert service.ui_state.selected_item is None
    assert service.ui_state.highlighted_items == []


@pytest.mark.asyncio
async def test_service_promotes_yolo_object_after_repeated_hits(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )

    payload = {
        "ts": 10.0,
        "view_pose": {"x": 1.0, "y": 2.0, "z": 0.0, "yaw": 0.4},
        "detections": [
            {
                "class_id": 56,
                "label": "chair",
                "confidence": 0.92,
                "world_x": 2.0,
                "world_y": 3.0,
                "world_z": 0.2,
                "size_x": 0.5,
                "size_y": 0.5,
                "size_z": 0.9,
                "crop_base64": "",
            }
        ],
    }

    for step in range(2):
        payload["ts"] = 10.0 + step
        await service._handle_yolo_detections(payload)

    assert len(storage.list_yolo_objects()) == 1
    object_record = storage.list_yolo_objects()[0]
    assert object_record.label == "chair"
    assert object_record.best_view_x == pytest.approx(1.0)
    assert object_record.best_view_y == pytest.approx(2.0)


@pytest.mark.asyncio
async def test_service_does_not_promote_yolo_object_when_hits_are_too_far_apart(
    tmp_path: Path,
) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )

    payload = {
        "ts": 10.0,
        "view_pose": {"x": 1.0, "y": 2.0, "z": 0.0, "yaw": 0.4},
        "detections": [
            {
                "class_id": 56,
                "label": "chair",
                "confidence": 0.92,
                "world_x": 2.0,
                "world_y": 3.0,
                "world_z": 0.2,
                "size_x": 0.5,
                "size_y": 0.5,
                "size_z": 0.9,
                "crop_base64": "",
            }
        ],
    }

    await service._handle_yolo_detections(payload)
    payload["ts"] = 23.0
    await service._handle_yolo_detections(payload)

    assert storage.list_yolo_objects() == []


@pytest.mark.asyncio
async def test_service_go_to_yolo_object_uses_best_view_pose(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    fake_mcp = FakeMcpClient(make_test_jpeg())
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=fake_mcp,
        analyzer=FakeAnalyzer(),
        poi_arrival_settle_seconds=0.0,
    )
    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    object_record = storage.new_yolo_object(
        map_id="active",
        label="chair",
        class_id=56,
        world_x=2.4,
        world_y=1.8,
        world_z=0.3,
        size_x=0.5,
        size_y=0.4,
        size_z=0.9,
        best_view_x=1.2,
        best_view_y=1.4,
        best_view_yaw=0.8,
        thumbnail_path=thumb,
        hero_image_path=hero,
        detections_count=6,
        best_confidence=0.91,
    )
    storage.upsert_yolo_object(object_record)
    service.yolo_objects[object_record.object_id] = object_record
    service.robot_pose = RobotPose(x=object_record.best_view_x, y=object_record.best_view_y, z=0.0, yaw=0.1)
    fake_map_client = FakeMapClient()
    service.map_client = fake_map_client  # type: ignore[assignment]

    await service.go_to_yolo_object(object_record.object_id)
    assert service._goto_poi_task is not None
    await asyncio.wait_for(service._goto_poi_task, timeout=1.0)

    assert fake_map_client.calls == [(1.2, 1.4, None)]
    assert fake_mcp.relative_move_calls == [(0.0, 0.0, pytest.approx(40.10704565915762))]


@pytest.mark.asyncio
async def test_service_send_move_command_uses_map_socket(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    fake_map_client = FakeMapClient()
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
    )
    service.map_client = fake_map_client  # type: ignore[assignment]

    result = await service.send_move_command(linear_x=0.4, linear_y=0.2, angular_z=-0.7)

    assert result == {"ok": True}
    assert fake_map_client.move_calls == [
        {
            "linear_x": 0.4,
            "linear_y": 0.2,
            "linear_z": 0.0,
            "angular_x": 0.0,
            "angular_y": 0.0,
            "angular_z": -0.7,
        }
    ]


@pytest.mark.asyncio
async def test_service_stop_dimos_runs_stop_command_after_zero_velocity(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    fake_map_client = FakeMapClient()
    stop_calls: list[bool] = []

    def fake_stop_runner(force: bool = False) -> dict[str, object]:
        stop_calls.append(force)
        return {"ok": True, "returncode": 0, "stdout": "stopped", "stderr": ""}

    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
        stop_command_runner=fake_stop_runner,
    )
    service.map_client = fake_map_client  # type: ignore[assignment]

    result = await service.stop_dimos(force=False)

    assert result["ok"] is True
    assert stop_calls == [False]
    assert fake_map_client.move_calls[-1] == {
        "linear_x": 0.0,
        "linear_y": 0.0,
        "linear_z": 0.0,
        "angular_x": 0.0,
        "angular_y": 0.0,
        "angular_z": 0.0,
    }


@pytest.mark.asyncio
async def test_service_submit_chat_message_runs_agent_and_updates_state(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    fake_chat_agent = FakeChatAgent(content="The window POI is highlighted on the map.")
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
        chat_agent=fake_chat_agent,
    )

    initial = await service.submit_chat_message("Where is the window?")
    assert initial["running"] is True
    assert [message["role"] for message in initial["messages"]] == ["user", "assistant"]

    assert service._chat_task is not None
    await asyncio.wait_for(service._chat_task, timeout=1.0)

    snapshot = await service.chat_snapshot()
    assert snapshot["running"] is False
    assert snapshot["messages"][0]["content"] == "Where is the window?"
    assert snapshot["messages"][1]["content"] == "The window POI is highlighted on the map."
    assert snapshot["messages"][1]["tools_used"] == [
        "search_semantic_memory",
        "focus_semantic_item",
    ]
    assert fake_chat_agent.calls == [("Where is the window?", 0)]


@pytest.mark.asyncio
async def test_chat_search_semantic_memory_finds_matching_poi(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
        chat_agent=FakeChatAgent(),
    )
    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")
    poi = storage.new_poi(
        map_id="active",
        world_x=1.0,
        world_y=2.0,
        world_yaw=0.1,
        title="Window Bay",
        summary="Bright corner with a large exterior window and plants.",
        category="window",
        interest_score=0.8,
        thumbnail_path=thumb,
        hero_image_path=hero,
        objects=["window", "plant"],
    )
    storage.upsert_poi(poi)
    service.pois[poi.poi_id] = poi

    result = await service.chat_search_semantic_memory(query="window", kind="all", limit=5)

    assert result["results"][0]["kind"] == "vlm_poi"
    assert result["results"][0]["entity_id"] == poi.poi_id


@pytest.mark.asyncio
async def test_chat_set_layer_visibility_updates_state(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
        chat_agent=FakeChatAgent(),
    )

    result = await service.chat_set_layer_visibility(show_pois=False, show_yolo=True)
    snapshot = await service.snapshot()

    assert result == {"ok": True, "layers": {"show_pois": False, "show_yolo": True}}
    assert snapshot["layers"] == {"show_pois": False, "show_yolo": True}


@pytest.mark.asyncio
async def test_chat_set_yolo_runtime_updates_state(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
        chat_agent=FakeChatAgent(),
    )

    result = await service.chat_set_yolo_runtime(mode="paused")
    snapshot = await service.snapshot()

    assert result == {"ok": True, "yolo_runtime": {"mode": "paused", "inference_enabled": True}}
    assert snapshot["yolo_runtime"] == {"mode": "paused", "inference_enabled": True}


@pytest.mark.asyncio
async def test_set_yolo_runtime_updates_detector_inference_flag(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    fake_mcp = FakeMcpClient(make_test_jpeg())
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=fake_mcp,
        analyzer=FakeAnalyzer(),
        chat_agent=FakeChatAgent(),
    )

    result = await service.set_yolo_runtime(inference_enabled=False)
    snapshot = await service.snapshot()

    assert result == {"mode": "live", "inference_enabled": False}
    assert snapshot["yolo_runtime"] == {"mode": "live", "inference_enabled": False}
    assert fake_mcp.set_yolo_inference_calls == [False]


@pytest.mark.asyncio
async def test_chat_save_map_persists_active_map(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    service = SlamassService(
        map_socket_url="http://localhost:7779",
        mcp_url="http://localhost:9990/mcp",
        state_dir=tmp_path,
        storage=storage,
        mcp_client=FakeMcpClient(make_test_jpeg()),
        analyzer=FakeAnalyzer(),
        chat_agent=FakeChatAgent(),
    )
    await service._handle_raw_costmap(
        RawCostmap(
            grid=np.full((3, 3), 100, dtype=np.int8),
            origin_x=0.0,
            origin_y=0.0,
            resolution=0.05,
            ts=0.0,
        )
    )

    result = await service.chat_save_map()

    assert result["ok"] is True
    assert result["saved"] is True
    assert (tmp_path / "maps" / "active_map.npz").exists()
