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
import sqlite3

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
        target_x=1.6,
        target_y=2.4,
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
    assert listed[0].anchor_x == 1.0
    assert listed[0].anchor_y == 2.0
    assert listed[0].anchor_yaw == 0.1
    assert listed[0].target_x == 1.6
    assert listed[0].target_y == 2.4

    storage.soft_delete_poi(poi.poi_id)
    assert storage.list_pois() == []
    assert storage.get_poi(poi.poi_id) is not None


def test_storage_migrates_legacy_poi_rows_to_anchor_and_target(tmp_path: Path) -> None:
    state_dir = tmp_path
    state_dir.mkdir(parents=True, exist_ok=True)
    db_path = state_dir / "slamass.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE pois (
            poi_id TEXT PRIMARY KEY,
            map_id TEXT NOT NULL,
            world_x REAL NOT NULL,
            world_y REAL NOT NULL,
            world_yaw REAL NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            category TEXT NOT NULL,
            interest_score REAL NOT NULL,
            status TEXT NOT NULL,
            thumbnail_path TEXT NOT NULL,
            hero_image_path TEXT NOT NULL,
            objects_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO pois (
            poi_id, map_id, world_x, world_y, world_yaw, title, summary, category,
            interest_score, status, thumbnail_path, hero_image_path, objects_json,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "legacy-poi",
            "active",
            1.25,
            -0.5,
            0.35,
            "Legacy Window",
            "Legacy row from pre-split schema.",
            "window",
            0.8,
            "active",
            "images/thumb.jpg",
            "images/hero.jpg",
            '["window"]',
            "2026-03-21T00:00:00Z",
            "2026-03-21T00:00:00Z",
        ),
    )
    conn.commit()
    conn.close()

    storage = SlamassStorage(state_dir)
    listed = storage.list_pois()

    assert len(listed) == 1
    assert listed[0].anchor_x == 1.25
    assert listed[0].anchor_y == -0.5
    assert listed[0].anchor_yaw == 0.35
    assert listed[0].target_x == 1.25
    assert listed[0].target_y == -0.5


def test_settings_round_trip(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)

    storage.save_json_setting(
        "inspection_settings",
        {"manual_mode": "always_create"},
    )

    loaded = storage.load_json_setting("inspection_settings")

    assert loaded == {"manual_mode": "always_create"}


def test_yolo_object_upsert_and_soft_delete(tmp_path: Path) -> None:
    storage = SlamassStorage(tmp_path)
    hero = storage.create_image_asset(b"hero", ".jpg")
    thumb = storage.create_image_asset(b"thumb", ".jpg")

    object_record = storage.new_yolo_object(
        map_id="active",
        label="chair",
        class_id=56,
        world_x=1.5,
        world_y=-0.25,
        world_z=0.4,
        size_x=0.5,
        size_y=0.5,
        size_z=0.9,
        best_view_x=1.0,
        best_view_y=-0.75,
        best_view_yaw=0.3,
        thumbnail_path=thumb,
        hero_image_path=hero,
        detections_count=4,
        best_confidence=0.91,
    )
    storage.upsert_yolo_object(object_record)

    listed = storage.list_yolo_objects()
    assert len(listed) == 1
    assert listed[0].label == "chair"
    assert listed[0].best_view_yaw == 0.3

    storage.soft_delete_yolo_object(object_record.object_id)
    assert storage.list_yolo_objects() == []
    assert storage.get_yolo_object(object_record.object_id) is not None
