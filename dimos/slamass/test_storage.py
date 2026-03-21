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

import numpy as np

from dimos.slamass.storage import SlamassStorage


def test_storage_round_trip(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)

    log_odds = np.ones((4, 5), dtype=np.float32)
    observation_count = np.full((4, 5), 3, dtype=np.uint16)
    preview_png = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\x0dIDATx\x9cc```\xf8\x0f\x00\x01\x05\x01\x02\xa2~\xd5\x9b"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    record = storage.save_active_map(
        map_id="active",
        resolution=0.15,
        origin_x=-1.5,
        origin_y=2.25,
        log_odds=log_odds,
        observation_count=observation_count,
        preview_png=preview_png,
    )

    loaded_record, loaded_log_odds, loaded_observation_count = storage.load_active_map()

    assert record.map_id == "active"
    assert loaded_record is not None
    assert loaded_record.origin_x == -1.5
    assert loaded_log_odds is not None
    assert loaded_observation_count is not None
    assert loaded_log_odds.shape == (4, 5)
    assert int(loaded_observation_count[0, 0]) == 3


def test_storage_ignores_empty_active_map_artifact(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)

    storage.save_active_map(
        map_id="active",
        resolution=0.15,
        origin_x=-1.5,
        origin_y=2.25,
        log_odds=np.ones((2, 3), dtype=np.float32),
        observation_count=np.full((2, 3), 3, dtype=np.uint16),
        preview_png=b"preview",
    )

    artifact_path = tmp_path / "maps" / "active_map.npz"
    artifact_path.write_bytes(b"")

    loaded_record, loaded_log_odds, loaded_observation_count = storage.load_active_map()

    assert loaded_record is not None
    assert loaded_record.map_id == "active"
    assert loaded_log_odds is None
    assert loaded_observation_count is None


def test_poi_upsert_and_soft_delete(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
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

    listed = storage.list_pois()
    assert len(listed) == 1
    assert listed[0].title == "Window Nook"
    assert listed[0].objects == ["window", "chair"]

    storage.soft_delete_poi(poi.poi_id)
    assert storage.list_pois() == []
    assert storage.get_poi(poi.poi_id) is not None


def test_settings_round_trip(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)

    storage.save_json_setting(
        "inspection_settings",
        {"manual_mode": "always_create"},
    )

    loaded = storage.load_json_setting("inspection_settings")

    assert loaded == {"manual_mode": "always_create"}
