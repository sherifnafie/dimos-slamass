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

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sqlite3
import threading
import uuid
from zipfile import BadZipFile

import numpy as np

logger = logging.getLogger(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class ActiveMapRecord:
    map_id: str
    resolution: float
    origin_x: float
    origin_y: float
    width: int
    height: int
    artifact_npz_path: str
    preview_png_path: str
    updated_at: str


@dataclass(slots=True)
class PoiRecord:
    poi_id: str
    map_id: str
    world_x: float
    world_y: float
    world_yaw: float
    title: str
    summary: str
    category: str
    interest_score: float
    status: str
    thumbnail_path: str
    hero_image_path: str
    objects_json: str
    created_at: str
    updated_at: str

    @property
    def objects(self) -> list[str]:
        raw = json.loads(self.objects_json or "[]")
        return [str(item) for item in raw]


@dataclass(slots=True)
class PoiObservationRecord:
    observation_id: str
    poi_id: str | None
    world_x: float
    world_y: float
    world_yaw: float
    image_path: str
    thumbnail_path: str
    model_payload_json: str
    gate_result: str
    created_at: str


@dataclass(slots=True)
class YoloObjectRecord:
    object_id: str
    map_id: str
    label: str
    class_id: int
    world_x: float
    world_y: float
    world_z: float
    size_x: float
    size_y: float
    size_z: float
    best_view_x: float
    best_view_y: float
    best_view_yaw: float
    status: str
    thumbnail_path: str
    hero_image_path: str
    detections_count: int
    best_confidence: float
    created_at: str
    updated_at: str
    last_seen_at: str


@dataclass(slots=True)
class YoloObservationRecord:
    observation_id: str
    object_id: str | None
    label: str
    class_id: int
    confidence: float
    world_x: float
    world_y: float
    world_z: float
    size_x: float
    size_y: float
    size_z: float
    view_x: float
    view_y: float
    view_yaw: float
    image_path: str | None
    thumbnail_path: str | None
    created_at: str


class SlamassStorage:
    def __init__(self, state_dir: Path) -> None:
        self.state_dir = state_dir
        self.images_dir = self.state_dir / "images"
        self.maps_dir = self.state_dir / "maps"
        self.db_path = self.state_dir / "slamass.db"
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.maps_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn: sqlite3.Connection | None = None
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        with self._lock:
            if self._conn is None:
                self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
                self._conn.row_factory = sqlite3.Row
            return self._conn

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def _init_db(self) -> None:
        conn = self._get_conn()
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS active_map (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                map_id TEXT NOT NULL,
                resolution REAL NOT NULL,
                origin_x REAL NOT NULL,
                origin_y REAL NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                artifact_npz_path TEXT NOT NULL,
                preview_png_path TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pois (
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

            CREATE TABLE IF NOT EXISTS poi_observations (
                observation_id TEXT PRIMARY KEY,
                poi_id TEXT,
                world_x REAL NOT NULL,
                world_y REAL NOT NULL,
                world_yaw REAL NOT NULL,
                image_path TEXT NOT NULL,
                thumbnail_path TEXT NOT NULL,
                model_payload_json TEXT NOT NULL,
                gate_result TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS yolo_objects (
                object_id TEXT PRIMARY KEY,
                map_id TEXT NOT NULL,
                label TEXT NOT NULL,
                class_id INTEGER NOT NULL,
                world_x REAL NOT NULL,
                world_y REAL NOT NULL,
                world_z REAL NOT NULL,
                size_x REAL NOT NULL,
                size_y REAL NOT NULL,
                size_z REAL NOT NULL,
                best_view_x REAL NOT NULL,
                best_view_y REAL NOT NULL,
                best_view_yaw REAL NOT NULL,
                status TEXT NOT NULL,
                thumbnail_path TEXT NOT NULL,
                hero_image_path TEXT NOT NULL,
                detections_count INTEGER NOT NULL,
                best_confidence REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS yolo_object_observations (
                observation_id TEXT PRIMARY KEY,
                object_id TEXT,
                label TEXT NOT NULL,
                class_id INTEGER NOT NULL,
                confidence REAL NOT NULL,
                world_x REAL NOT NULL,
                world_y REAL NOT NULL,
                world_z REAL NOT NULL,
                size_x REAL NOT NULL,
                size_y REAL NOT NULL,
                size_z REAL NOT NULL,
                view_x REAL NOT NULL,
                view_y REAL NOT NULL,
                view_yaw REAL NOT NULL,
                image_path TEXT,
                thumbnail_path TEXT,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.commit()

    def asset_path(self, relative_path: str) -> Path:
        return self.state_dir / relative_path

    def create_image_asset(self, data: bytes, suffix: str = ".jpg") -> str:
        filename = f"{uuid.uuid4().hex}{suffix}"
        path = self.images_dir / filename
        path.write_bytes(data)
        return str(path.relative_to(self.state_dir))

    def save_active_map(
        self,
        *,
        map_id: str,
        resolution: float,
        origin_x: float,
        origin_y: float,
        log_odds: np.ndarray,
        observation_count: np.ndarray,
        preview_png: bytes,
    ) -> ActiveMapRecord:
        npz_rel = Path("maps") / "active_map.npz"
        png_rel = Path("maps") / "active_map.png"
        np.savez_compressed(
            self.state_dir / npz_rel,
            log_odds=np.asarray(log_odds, dtype=np.float32),
            observation_count=np.asarray(observation_count, dtype=np.uint16),
        )
        (self.state_dir / png_rel).write_bytes(preview_png)

        record = ActiveMapRecord(
            map_id=map_id,
            resolution=resolution,
            origin_x=origin_x,
            origin_y=origin_y,
            width=int(log_odds.shape[1]),
            height=int(log_odds.shape[0]),
            artifact_npz_path=str(npz_rel),
            preview_png_path=str(png_rel),
            updated_at=utc_now_iso(),
        )

        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO active_map (
                id, map_id, resolution, origin_x, origin_y, width, height,
                artifact_npz_path, preview_png_path, updated_at
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                map_id = excluded.map_id,
                resolution = excluded.resolution,
                origin_x = excluded.origin_x,
                origin_y = excluded.origin_y,
                width = excluded.width,
                height = excluded.height,
                artifact_npz_path = excluded.artifact_npz_path,
                preview_png_path = excluded.preview_png_path,
                updated_at = excluded.updated_at
            """,
            (
                record.map_id,
                record.resolution,
                record.origin_x,
                record.origin_y,
                record.width,
                record.height,
                record.artifact_npz_path,
                record.preview_png_path,
                record.updated_at,
            ),
        )
        conn.commit()
        return record

    def write_active_map_preview(self, preview_png: bytes) -> str:
        png_rel = Path("maps") / "active_map.png"
        (self.state_dir / png_rel).write_bytes(preview_png)
        return str(png_rel)

    def load_json_setting(self, key: str) -> dict[str, object] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT value_json FROM app_settings WHERE key = ?", (key,)).fetchone()
        if row is None:
            return None
        parsed = json.loads(str(row["value_json"]))
        if not isinstance(parsed, dict):
            return None
        return parsed

    def save_json_setting(self, key: str, value: dict[str, object]) -> None:
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO app_settings (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            """,
            (key, json.dumps(value), utc_now_iso()),
        )
        conn.commit()

    def load_active_map(
        self,
    ) -> tuple[ActiveMapRecord | None, np.ndarray | None, np.ndarray | None]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM active_map WHERE id = 1").fetchone()
        if row is None:
            return None, None, None

        record = ActiveMapRecord(
            map_id=str(row["map_id"]),
            resolution=float(row["resolution"]),
            origin_x=float(row["origin_x"]),
            origin_y=float(row["origin_y"]),
            width=int(row["width"]),
            height=int(row["height"]),
            artifact_npz_path=str(row["artifact_npz_path"]),
            preview_png_path=str(row["preview_png_path"]),
            updated_at=str(row["updated_at"]),
        )

        artifact_path = self.asset_path(record.artifact_npz_path)
        if not artifact_path.exists():
            return record, None, None

        if artifact_path.stat().st_size == 0:
            logger.warning("Ignoring empty SLAMASS map artifact at %s", artifact_path)
            return record, None, None

        try:
            with np.load(artifact_path) as loaded:
                return record, loaded["log_odds"], loaded["observation_count"]
        except (BadZipFile, EOFError, KeyError, OSError, ValueError) as exc:
            logger.warning(
                "Ignoring unreadable SLAMASS map artifact at %s: %s",
                artifact_path,
                exc,
            )
            return record, None, None

    def upsert_poi(self, record: PoiRecord) -> None:
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO pois (
                poi_id, map_id, world_x, world_y, world_yaw, title, summary, category,
                interest_score, status, thumbnail_path, hero_image_path, objects_json,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(poi_id) DO UPDATE SET
                map_id = excluded.map_id,
                world_x = excluded.world_x,
                world_y = excluded.world_y,
                world_yaw = excluded.world_yaw,
                title = excluded.title,
                summary = excluded.summary,
                category = excluded.category,
                interest_score = excluded.interest_score,
                status = excluded.status,
                thumbnail_path = excluded.thumbnail_path,
                hero_image_path = excluded.hero_image_path,
                objects_json = excluded.objects_json,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at
            """,
            (
                record.poi_id,
                record.map_id,
                record.world_x,
                record.world_y,
                record.world_yaw,
                record.title,
                record.summary,
                record.category,
                record.interest_score,
                record.status,
                record.thumbnail_path,
                record.hero_image_path,
                record.objects_json,
                record.created_at,
                record.updated_at,
            ),
        )
        conn.commit()

    def get_poi(self, poi_id: str) -> PoiRecord | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM pois WHERE poi_id = ?", (poi_id,)).fetchone()
        if row is None:
            return None
        return self._poi_from_row(row)

    def list_pois(self, include_deleted: bool = False) -> list[PoiRecord]:
        conn = self._get_conn()
        if include_deleted:
            rows = conn.execute("SELECT * FROM pois ORDER BY created_at ASC").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM pois WHERE status != 'deleted' ORDER BY created_at ASC"
            ).fetchall()
        return [self._poi_from_row(row) for row in rows]

    def soft_delete_poi(self, poi_id: str) -> None:
        conn = self._get_conn()
        conn.execute(
            "UPDATE pois SET status = 'deleted', updated_at = ? WHERE poi_id = ?",
            (utc_now_iso(), poi_id),
        )
        conn.commit()

    def insert_observation(self, record: PoiObservationRecord) -> None:
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO poi_observations (
                observation_id, poi_id, world_x, world_y, world_yaw, image_path,
                thumbnail_path, model_payload_json, gate_result, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.observation_id,
                record.poi_id,
                record.world_x,
                record.world_y,
                record.world_yaw,
                record.image_path,
                record.thumbnail_path,
                record.model_payload_json,
                record.gate_result,
                record.created_at,
            ),
        )
        conn.commit()

    def upsert_yolo_object(self, record: YoloObjectRecord) -> None:
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO yolo_objects (
                object_id, map_id, label, class_id, world_x, world_y, world_z,
                size_x, size_y, size_z, best_view_x, best_view_y, best_view_yaw,
                status, thumbnail_path, hero_image_path, detections_count,
                best_confidence, created_at, updated_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(object_id) DO UPDATE SET
                map_id = excluded.map_id,
                label = excluded.label,
                class_id = excluded.class_id,
                world_x = excluded.world_x,
                world_y = excluded.world_y,
                world_z = excluded.world_z,
                size_x = excluded.size_x,
                size_y = excluded.size_y,
                size_z = excluded.size_z,
                best_view_x = excluded.best_view_x,
                best_view_y = excluded.best_view_y,
                best_view_yaw = excluded.best_view_yaw,
                status = excluded.status,
                thumbnail_path = excluded.thumbnail_path,
                hero_image_path = excluded.hero_image_path,
                detections_count = excluded.detections_count,
                best_confidence = excluded.best_confidence,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                last_seen_at = excluded.last_seen_at
            """,
            (
                record.object_id,
                record.map_id,
                record.label,
                record.class_id,
                record.world_x,
                record.world_y,
                record.world_z,
                record.size_x,
                record.size_y,
                record.size_z,
                record.best_view_x,
                record.best_view_y,
                record.best_view_yaw,
                record.status,
                record.thumbnail_path,
                record.hero_image_path,
                record.detections_count,
                record.best_confidence,
                record.created_at,
                record.updated_at,
                record.last_seen_at,
            ),
        )
        conn.commit()

    def get_yolo_object(self, object_id: str) -> YoloObjectRecord | None:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM yolo_objects WHERE object_id = ?",
            (object_id,),
        ).fetchone()
        if row is None:
            return None
        return self._yolo_object_from_row(row)

    def list_yolo_objects(self, include_deleted: bool = False) -> list[YoloObjectRecord]:
        conn = self._get_conn()
        if include_deleted:
            rows = conn.execute(
                "SELECT * FROM yolo_objects ORDER BY created_at ASC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM yolo_objects WHERE status != 'deleted' ORDER BY created_at ASC"
            ).fetchall()
        return [self._yolo_object_from_row(row) for row in rows]

    def soft_delete_yolo_object(self, object_id: str) -> None:
        conn = self._get_conn()
        conn.execute(
            "UPDATE yolo_objects SET status = 'deleted', updated_at = ? WHERE object_id = ?",
            (utc_now_iso(), object_id),
        )
        conn.commit()

    def insert_yolo_observation(self, record: YoloObservationRecord) -> None:
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO yolo_object_observations (
                observation_id, object_id, label, class_id, confidence, world_x, world_y, world_z,
                size_x, size_y, size_z, view_x, view_y, view_yaw, image_path, thumbnail_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.observation_id,
                record.object_id,
                record.label,
                record.class_id,
                record.confidence,
                record.world_x,
                record.world_y,
                record.world_z,
                record.size_x,
                record.size_y,
                record.size_z,
                record.view_x,
                record.view_y,
                record.view_yaw,
                record.image_path,
                record.thumbnail_path,
                record.created_at,
            ),
        )
        conn.commit()

    @staticmethod
    def new_poi(
        *,
        map_id: str,
        world_x: float,
        world_y: float,
        world_yaw: float,
        title: str,
        summary: str,
        category: str,
        interest_score: float,
        thumbnail_path: str,
        hero_image_path: str,
        objects: list[str],
        poi_id: str | None = None,
        created_at: str | None = None,
    ) -> PoiRecord:
        now = utc_now_iso()
        return PoiRecord(
            poi_id=poi_id or uuid.uuid4().hex,
            map_id=map_id,
            world_x=world_x,
            world_y=world_y,
            world_yaw=world_yaw,
            title=title,
            summary=summary,
            category=category,
            interest_score=interest_score,
            status="active",
            thumbnail_path=thumbnail_path,
            hero_image_path=hero_image_path,
            objects_json=json.dumps(objects),
            created_at=created_at or now,
            updated_at=now,
        )

    @staticmethod
    def new_observation(
        *,
        poi_id: str | None,
        world_x: float,
        world_y: float,
        world_yaw: float,
        image_path: str,
        thumbnail_path: str,
        model_payload_json: str,
        gate_result: str,
    ) -> PoiObservationRecord:
        return PoiObservationRecord(
            observation_id=uuid.uuid4().hex,
            poi_id=poi_id,
            world_x=world_x,
            world_y=world_y,
            world_yaw=world_yaw,
            image_path=image_path,
            thumbnail_path=thumbnail_path,
            model_payload_json=model_payload_json,
            gate_result=gate_result,
            created_at=utc_now_iso(),
        )

    @staticmethod
    def new_yolo_object(
        *,
        map_id: str,
        label: str,
        class_id: int,
        world_x: float,
        world_y: float,
        world_z: float,
        size_x: float,
        size_y: float,
        size_z: float,
        best_view_x: float,
        best_view_y: float,
        best_view_yaw: float,
        thumbnail_path: str,
        hero_image_path: str,
        detections_count: int,
        best_confidence: float,
        object_id: str | None = None,
        created_at: str | None = None,
        last_seen_at: str | None = None,
    ) -> YoloObjectRecord:
        now = utc_now_iso()
        return YoloObjectRecord(
            object_id=object_id or uuid.uuid4().hex,
            map_id=map_id,
            label=label,
            class_id=class_id,
            world_x=world_x,
            world_y=world_y,
            world_z=world_z,
            size_x=size_x,
            size_y=size_y,
            size_z=size_z,
            best_view_x=best_view_x,
            best_view_y=best_view_y,
            best_view_yaw=best_view_yaw,
            status="active",
            thumbnail_path=thumbnail_path,
            hero_image_path=hero_image_path,
            detections_count=detections_count,
            best_confidence=best_confidence,
            created_at=created_at or now,
            updated_at=now,
            last_seen_at=last_seen_at or now,
        )

    @staticmethod
    def new_yolo_observation(
        *,
        object_id: str | None,
        label: str,
        class_id: int,
        confidence: float,
        world_x: float,
        world_y: float,
        world_z: float,
        size_x: float,
        size_y: float,
        size_z: float,
        view_x: float,
        view_y: float,
        view_yaw: float,
        image_path: str | None,
        thumbnail_path: str | None,
    ) -> YoloObservationRecord:
        return YoloObservationRecord(
            observation_id=uuid.uuid4().hex,
            object_id=object_id,
            label=label,
            class_id=class_id,
            confidence=confidence,
            world_x=world_x,
            world_y=world_y,
            world_z=world_z,
            size_x=size_x,
            size_y=size_y,
            size_z=size_z,
            view_x=view_x,
            view_y=view_y,
            view_yaw=view_yaw,
            image_path=image_path,
            thumbnail_path=thumbnail_path,
            created_at=utc_now_iso(),
        )

    @staticmethod
    def _poi_from_row(row: sqlite3.Row) -> PoiRecord:
        return PoiRecord(
            poi_id=str(row["poi_id"]),
            map_id=str(row["map_id"]),
            world_x=float(row["world_x"]),
            world_y=float(row["world_y"]),
            world_yaw=float(row["world_yaw"]),
            title=str(row["title"]),
            summary=str(row["summary"]),
            category=str(row["category"]),
            interest_score=float(row["interest_score"]),
            status=str(row["status"]),
            thumbnail_path=str(row["thumbnail_path"]),
            hero_image_path=str(row["hero_image_path"]),
            objects_json=str(row["objects_json"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    @staticmethod
    def _yolo_object_from_row(row: sqlite3.Row) -> YoloObjectRecord:
        return YoloObjectRecord(
            object_id=str(row["object_id"]),
            map_id=str(row["map_id"]),
            label=str(row["label"]),
            class_id=int(row["class_id"]),
            world_x=float(row["world_x"]),
            world_y=float(row["world_y"]),
            world_z=float(row["world_z"]),
            size_x=float(row["size_x"]),
            size_y=float(row["size_y"]),
            size_z=float(row["size_z"]),
            best_view_x=float(row["best_view_x"]),
            best_view_y=float(row["best_view_y"]),
            best_view_yaw=float(row["best_view_yaw"]),
            status=str(row["status"]),
            thumbnail_path=str(row["thumbnail_path"]),
            hero_image_path=str(row["hero_image_path"]),
            detections_count=int(row["detections_count"]),
            best_confidence=float(row["best_confidence"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            last_seen_at=str(row["last_seen_at"]),
        )
