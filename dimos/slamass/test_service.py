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

from pathlib import Path

import cv2
import numpy as np
import pytest

from dimos.slamass.map_memory import RawCostmap
from dimos.slamass.service import InspectionAnalysis, RobotPose, SlamassService
from dimos.slamass.storage import SlamassStorage


class FakeMcpClient:
    def __init__(self, image_bytes: bytes) -> None:
        self._image_bytes = image_bytes

    def observe_jpeg(self) -> bytes:
        return self._image_bytes


class FakeMapClient:
    def __init__(self) -> None:
        self.calls: list[tuple[float, float, float | None]] = []

    async def emit_click(self, x: float, y: float, yaw: float | None = None) -> None:
        self.calls.append((x, y, yaw))


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


def make_test_jpeg() -> bytes:
    image = np.zeros((90, 160, 3), dtype=np.uint8)
    image[:, :, 0] = 30
    image[:, :, 1] = 180
    image[:, :, 2] = 240
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


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
async def test_service_go_to_poi_uses_stored_view_pose(tmp_path: Path) -> None:
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
    fake_map_client = FakeMapClient()
    service.map_client = fake_map_client  # type: ignore[assignment]

    await service.go_to_poi(poi.poi_id)

    assert fake_map_client.calls == [(1.25, -0.75, 0.6)]
