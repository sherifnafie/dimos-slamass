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

import argparse
import asyncio
import base64
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import json
import math
import os
from pathlib import Path
import time
from typing import Any
import zlib

import aiohttp
from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from PIL import Image
from pydantic import BaseModel
import socketio  # type: ignore[import-untyped]
from sse_starlette.sse import EventSourceResponse
import uvicorn

from dimos.models.vl.openai import OpenAIVlModel
from dimos.msgs.sensor_msgs.Image import ImageFormat
from dimos.msgs.sensor_msgs.Image import Image as DimosImage
from dimos.slamass.map_memory import ActiveMapState, RawCostmap
from dimos.slamass.storage import ActiveMapRecord, PoiRecord, SlamassStorage, utc_now_iso
from dimos.utils.llm_utils import extract_json
from dimos.utils.logging_config import setup_logger

logger = setup_logger()

UI_MIN_ZOOM = 1.0
UI_MAX_ZOOM = 8.0
UI_FOCUS_POI_ZOOM = 2.6
UI_FOCUS_ROBOT_ZOOM = 2.2
POI_ARRIVAL_TOLERANCE_METERS = 0.6
POI_ARRIVAL_SETTLE_SECONDS = 1.0
POI_ARRIVAL_TIMEOUT_SECONDS = 120.0
POI_ROTATION_THRESHOLD_DEGREES = 8.0
INSPECTION_MODE_AI_GATE = "ai_gate"
INSPECTION_MODE_ALWAYS_CREATE = "always_create"
VALID_MANUAL_INSPECTION_MODES = (
    INSPECTION_MODE_AI_GATE,
    INSPECTION_MODE_ALWAYS_CREATE,
)


def load_slamass_env() -> None:
    """Load dotenv files for the standalone SLAMASS service."""
    dotenv_candidates: list[Path] = []

    cwd_dotenv = find_dotenv(filename=".env", usecwd=True)
    if cwd_dotenv:
        dotenv_candidates.append(Path(cwd_dotenv))

    repo_dotenv = Path(__file__).resolve().parents[2] / ".env"
    if repo_dotenv.exists():
        dotenv_candidates.append(repo_dotenv)

    seen: set[Path] = set()
    for dotenv_path in dotenv_candidates:
        resolved = dotenv_path.resolve()
        if resolved in seen:
            continue
        load_dotenv(dotenv_path=resolved, override=False)
        seen.add(resolved)


load_slamass_env()


def default_state_dir() -> Path:
    base = Path(os.getenv("XDG_STATE_HOME", Path.home() / ".local" / "state"))
    return base / "dimos" / "slamass"


@dataclass(slots=True)
class RobotPose:
    x: float
    y: float
    z: float
    yaw: float


@dataclass(slots=True)
class InspectionAnalysis:
    title: str
    summary: str
    category: str
    interest_score: float
    should_create_poi: bool
    gate_reason: str
    objects: list[str]

    def as_payload(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "summary": self.summary,
            "category": self.category,
            "interest_score": self.interest_score,
            "should_create_poi": self.should_create_poi,
            "gate_reason": self.gate_reason,
            "objects": self.objects,
        }


@dataclass(slots=True)
class InspectionSettings:
    manual_mode: str = INSPECTION_MODE_AI_GATE


@dataclass(slots=True)
class UiCameraState:
    center_x: float | None = None
    center_y: float | None = None
    zoom: float = 1.0


@dataclass(slots=True)
class SlamassUiState:
    camera: UiCameraState = field(default_factory=UiCameraState)
    selected_poi_id: str | None = None
    highlighted_poi_ids: list[str] = field(default_factory=list)
    revision: int = 0


class NavigateRequest(BaseModel):
    x: float
    y: float
    yaw: float | None = None


class UiCameraRequest(BaseModel):
    center_x: float
    center_y: float
    zoom: float


class UiSelectionRequest(BaseModel):
    poi_id: str | None = None


class UiHighlightRequest(BaseModel):
    poi_ids: list[str]
    selected_poi_id: str | None = None


class UiFocusRequest(BaseModel):
    zoom: float | None = None


class InspectionSettingsRequest(BaseModel):
    manual_mode: str


class McpToolClient:
    def __init__(self, mcp_url: str) -> None:
        self.mcp_url = mcp_url
        self._session: aiohttp.ClientSession | None = None

    async def start(self) -> None:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=20)
            self._session = aiohttp.ClientSession(timeout=timeout)

    async def stop(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()

    async def observe_jpeg(self) -> bytes | None:
        body = await self.call_tool("observe")
        content = body.get("result", {}).get("content", [])
        if not isinstance(content, list):
            return None

        for item in content:
            if item.get("type") != "image_url":
                continue
            image_url = item.get("image_url", {}).get("url", "")
            if not isinstance(image_url, str) or not image_url.startswith("data:image/"):
                continue
            _, encoded = image_url.split(",", 1)
            return base64.b64decode(encoded)
        return None

    async def relative_move(
        self, *, forward: float = 0.0, left: float = 0.0, degrees: float = 0.0
    ) -> dict[str, Any]:
        return await self.call_tool(
            "relative_move",
            {"forward": forward, "left": left, "degrees": degrees},
        )

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
        *,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        await self.start()
        assert self._session is not None
        async with self._session.post(
            self.mcp_url,
            json={
                "jsonrpc": "2.0",
                "id": request_id or name,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments or {}},
            },
        ) as response:
            response.raise_for_status()
            body = await response.json()
        error = body.get("error")
        if error is not None:
            raise RuntimeError(f"MCP tool '{name}' failed: {error}")
        return body


class OpenAIInspectionAnalyzer:
    PROMPT = """Analyze this robot camera frame for a live robotics demo.

Return exactly one JSON object with these keys:
- title: short human-friendly POI title
- summary: 1-2 sentence description of what is notable in the frame
- category: short category like window, desk, lounge, poster, kitchen, entrance, hallway, display, plant
- interest_score: number from 0.0 to 1.0
- should_create_poi: boolean
- gate_reason: short reason for accepting or rejecting the frame
- objects: array of short object/location strings

Acceptance rules:
- Accept frames whenever they contain usable semantic information a human could later recognize on the map.
- Accept identifiable places or objects even if they are ordinary: desk areas, doors, windows, kitchen corners, seating, posters, shelves, appliances, hallway intersections, entryways, displays, plants, signage, workstations.
- Reject only when the frame provides almost no usable semantic information:
  - plain featureless wall, floor, or ceiling
  - severe motion blur
  - an extremely close-up crop with no scene context
  - a generic empty corridor or corner with nothing distinctive to point at
- Do not reject just because the scene is common or not visually dramatic.
- When the frame has weak but still usable context, accept it with a lower interest_score instead of rejecting it.

The title should name the place or salient thing, not a sentence.
The summary should describe visible evidence only.
"""

    def __init__(self, model_name: str = "gpt-4o") -> None:
        self._vlm = OpenAIVlModel(model_name=model_name)

    def analyze(self, image: DimosImage) -> InspectionAnalysis:
        response_text = self._vlm.query(
            image,
            self.PROMPT,
            response_format={"type": "json_object"},
        )
        parsed = extract_json(response_text)
        if not isinstance(parsed, dict):
            raise ValueError(f"Expected JSON object from VLM, got: {type(parsed)}")

        objects = parsed.get("objects") or []
        if not isinstance(objects, list):
            objects = []

        interest_score = float(parsed.get("interest_score", 0.0))
        interest_score = max(0.0, min(1.0, interest_score))
        title = str(parsed.get("title", "")).strip() or "Untitled POI"
        summary = str(parsed.get("summary", "")).strip() or "No summary provided."
        category = str(parsed.get("category", "")).strip() or "unknown"
        should_create_poi = bool(parsed.get("should_create_poi", False))
        gate_reason = str(parsed.get("gate_reason", "")).strip() or "No gate reason provided."

        return InspectionAnalysis(
            title=title[:80],
            summary=summary[:500],
            category=category[:40],
            interest_score=interest_score,
            should_create_poi=should_create_poi,
            gate_reason=gate_reason[:200],
            objects=[str(item)[:80] for item in objects],
        )


def decode_raw_costmap_message(payload: dict[str, Any]) -> RawCostmap:
    encoded = payload.get("data")
    shape = payload.get("shape")
    if not isinstance(encoded, str) or not isinstance(shape, list) or len(shape) != 2:
        raise ValueError("Invalid raw costmap payload")

    compressed = base64.b64decode(encoded)
    data = zlib.decompress(compressed)
    grid = np_frombuffer_int8(data, int(shape[0]), int(shape[1]))

    origin_data = payload.get("origin", {}).get("c", [0.0, 0.0, 0.0])
    return RawCostmap(
        grid=grid,
        origin_x=float(origin_data[0]),
        origin_y=float(origin_data[1]),
        resolution=float(payload.get("resolution", 0.1)),
        ts=float(payload.get("ts", time.time())),
    )


def np_frombuffer_int8(data: bytes, rows: int, cols: int) -> Any:
    import numpy as np

    return np.frombuffer(data, dtype=np.int8).reshape((rows, cols))


def jpeg_bytes_to_dimos_image(image_bytes: bytes) -> DimosImage:
    with Image.open(io_bytes(image_bytes)) as pil_image:
        rgb = pil_image.convert("RGB")
        return DimosImage.from_numpy(np_array(rgb), format=ImageFormat.RGB)


def np_frombuffer_u8(data: bytes) -> Any:
    import numpy as np

    return np.frombuffer(data, dtype=np.uint8)


def make_thumbnail(image_bytes: bytes, width: int = 320) -> bytes:
    with Image.open(io_bytes(image_bytes)) as pil_image:
        rgb = pil_image.convert("RGB")
        target_height = max(1, int(round(rgb.height * (width / rgb.width))))
        resized = rgb.resize((width, target_height), Image.Resampling.LANCZOS)
        output = io_bytes()
        resized.save(output, format="JPEG", quality=82)
        return output.getvalue()


def io_bytes(data: bytes | None = None) -> Any:
    import io

    return io.BytesIO(data or b"")


def np_array(pil_image: Image.Image) -> Any:
    import numpy as np

    return np.asarray(pil_image)


def normalize_text(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum() or ch.isspace()).strip()


def yaw_distance(a: float, b: float) -> float:
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


def angle_delta(target: float, current: float) -> float:
    return math.atan2(math.sin(target - current), math.cos(target - current))


def normalize_manual_inspection_mode(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in VALID_MANUAL_INSPECTION_MODES:
        raise ValueError(f"Unsupported inspection mode: {value}")
    return normalized


class MapSocketClient:
    def __init__(
        self,
        url: str,
        *,
        on_connection: Any,
        on_pose: Any,
        on_path: Any,
        on_raw_costmap: Any,
    ) -> None:
        self.url = url
        self._on_connection = on_connection
        self._on_pose = on_pose
        self._on_path = on_path
        self._on_raw_costmap = on_raw_costmap
        self._client = socketio.AsyncClient(reconnection=True)
        self._stopped = False
        self._task: asyncio.Task[None] | None = None
        self._register_handlers()

    @property
    def connected(self) -> bool:
        return self._client.connected

    async def start(self) -> None:
        self._task = asyncio.create_task(self._connect_loop())

    async def stop(self) -> None:
        self._stopped = True
        if self._client.connected:
            await self._client.disconnect()
        if self._task is not None:
            self._task.cancel()
            with contextlib_suppress(asyncio.CancelledError):
                await self._task

    async def emit_click(self, x: float, y: float, yaw: float | None = None) -> None:
        if not self._client.connected:
            raise RuntimeError("Map socket is not connected")
        payload: list[float] | dict[str, float]
        if yaw is None:
            # Preserve legacy click payload shape so plain click-to-go works
            # even if the running websocket_vis module has not been restarted
            # since yaw-aware click handling was added.
            payload = [x, y]
        else:
            payload = {"x": x, "y": y, "yaw": yaw}
        await self._client.emit("click", payload)

    def _register_handlers(self) -> None:
        @self._client.event
        async def connect() -> None:
            await self._on_connection(True)

        @self._client.event
        async def disconnect() -> None:
            await self._on_connection(False)

        @self._client.on("robot_pose")
        async def on_robot_pose(data: dict[str, Any]) -> None:
            coords = data.get("c", [])
            if len(coords) < 2:
                return
            pose = RobotPose(
                x=float(coords[0]),
                y=float(coords[1]),
                z=float(coords[2]) if len(coords) > 2 else 0.0,
                yaw=float(coords[3]) if len(coords) > 3 else 0.0,
            )
            await self._on_pose(pose)

        @self._client.on("path")
        async def on_path(data: dict[str, Any]) -> None:
            points = data.get("points", [])
            parsed = [[float(point[0]), float(point[1])] for point in points if len(point) >= 2]
            await self._on_path(parsed)

        @self._client.on("raw_costmap")
        async def on_raw_costmap(data: dict[str, Any]) -> None:
            await self._on_raw_costmap(decode_raw_costmap_message(data))

        @self._client.on("full_state")
        async def on_full_state(data: dict[str, Any]) -> None:
            if "robot_pose" in data:
                await on_robot_pose(data["robot_pose"])
            if "path" in data:
                await on_path(data["path"])
            if "raw_costmap" in data:
                await on_raw_costmap(data["raw_costmap"])

    async def _connect_loop(self) -> None:
        while not self._stopped:
            if self._client.connected:
                await asyncio.sleep(1.0)
                continue
            try:
                await self._client.connect(self.url, transports=["websocket", "polling"])
            except Exception as exc:
                logger.warning(
                    "SLAMASS service could not connect to websocket map source yet",
                    error=str(exc),
                    url=self.url,
                )
                await self._on_connection(False)
                await asyncio.sleep(2.0)
            else:
                while self._client.connected and not self._stopped:
                    await asyncio.sleep(1.0)


class SlamassService:
    def __init__(
        self,
        *,
        map_socket_url: str,
        mcp_url: str,
        state_dir: Path,
        model_name: str = "gpt-4o",
        storage: SlamassStorage | None = None,
        mcp_client: McpToolClient | None = None,
        analyzer: OpenAIInspectionAnalyzer | None = None,
        poi_arrival_tolerance_m: float = POI_ARRIVAL_TOLERANCE_METERS,
        poi_arrival_settle_seconds: float = POI_ARRIVAL_SETTLE_SECONDS,
        poi_arrival_timeout_seconds: float = POI_ARRIVAL_TIMEOUT_SECONDS,
        poi_rotation_threshold_degrees: float = POI_ROTATION_THRESHOLD_DEGREES,
    ) -> None:
        self.state_dir = state_dir
        self.storage = storage or SlamassStorage(state_dir)
        self.mcp_client = mcp_client or McpToolClient(mcp_url)
        self.analyzer = analyzer or OpenAIInspectionAnalyzer(model_name=model_name)
        self.map_client = MapSocketClient(
            map_socket_url,
            on_connection=self._handle_connection_change,
            on_pose=self._handle_pose,
            on_path=self._handle_path,
            on_raw_costmap=self._handle_raw_costmap,
        )
        self._tasks: list[asyncio.Task[None]] = []
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._state_lock = asyncio.Lock()
        self._dirty_map = False
        self._stopped = False
        self._last_pose_event = 0.0
        self._goto_poi_task: asyncio.Task[None] | None = None
        self._poi_arrival_tolerance_m = poi_arrival_tolerance_m
        self._poi_arrival_settle_seconds = poi_arrival_settle_seconds
        self._poi_arrival_timeout_seconds = poi_arrival_timeout_seconds
        self._poi_rotation_threshold_degrees = poi_rotation_threshold_degrees

        self.robot_pose: RobotPose | None = None
        self.path: list[list[float]] = []
        self.map_state: ActiveMapState | None = None
        self.map_record: ActiveMapRecord | None = None
        self.pois: dict[str, PoiRecord] = {}
        self.latest_pov_jpeg: bytes | None = None
        self.pov_seq: int = 0
        self.pov_updated_at: str | None = None
        self.connected: bool = False
        self.inspection_state: dict[str, Any] = {
            "status": "idle",
            "message": "",
            "poi_id": None,
        }
        self.inspection_settings = InspectionSettings()
        self.ui_state = SlamassUiState()

    async def start(self) -> None:
        self._load_from_storage()
        await self._maybe_start_mcp_client()
        await self.map_client.start()
        self._tasks = [
            asyncio.create_task(self._pov_loop()),
            asyncio.create_task(self._checkpoint_loop()),
        ]

    async def stop(self) -> None:
        self._stopped = True
        if self._goto_poi_task is not None:
            self._goto_poi_task.cancel()
            with contextlib_suppress(asyncio.CancelledError):
                await self._goto_poi_task
            self._goto_poi_task = None
        await self.map_client.stop()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib_suppress(asyncio.CancelledError):
                await task
        with contextlib_suppress(asyncio.CancelledError):
            await self.flush_active_map(force=True)
        with contextlib_suppress(asyncio.CancelledError):
            await self._maybe_stop_mcp_client()
        self.storage.close()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    async def publish_event(self, event: str, data: Any) -> None:
        dead_queues: list[asyncio.Queue[dict[str, Any]]] = []
        for queue in list(self._subscribers):
            try:
                queue.put_nowait({"event": event, "data": data})
            except asyncio.QueueFull:
                dead_queues.append(queue)
        for queue in dead_queues:
            self._subscribers.discard(queue)

    async def snapshot(self) -> dict[str, Any]:
        async with self._state_lock:
            return {
                "connected": self.connected,
                "robot_pose": self._serialize_pose(self.robot_pose),
                "path": self.path,
                "pov": {
                    "available": self.latest_pov_jpeg is not None,
                    "seq": self.pov_seq,
                    "updated_at": self.pov_updated_at,
                    "image_url": f"/api/pov/latest.jpg?v={self.pov_seq}",
                },
                "map": self._serialize_map(),
                "pois": [self._serialize_poi(poi) for poi in self._active_pois()],
                "inspection": dict(self.inspection_state),
                "inspection_settings": self._serialize_inspection_settings_locked(),
                "ui": self._serialize_ui_locked(),
            }

    async def navigate(self, x: float, y: float, yaw: float | None = None) -> None:
        await self.map_client.emit_click(x, y, yaw)

    async def go_to_poi(self, poi_id: str) -> None:
        async with self._state_lock:
            poi = self.pois.get(poi_id)
            if poi is None or poi.status == "deleted":
                raise HTTPException(status_code=404, detail="POI not found")
            target_x = poi.world_x
            target_y = poi.world_y
            target_yaw = poi.world_yaw
        await self.navigate(target_x, target_y)
        if self._goto_poi_task is not None:
            self._goto_poi_task.cancel()
            with contextlib_suppress(asyncio.CancelledError):
                await self._goto_poi_task
        self._goto_poi_task = asyncio.create_task(
            self._finish_poi_navigation(
                poi_id=poi_id,
                target_x=target_x,
                target_y=target_y,
                target_yaw=target_yaw,
            )
        )

    async def set_manual_inspection_mode(self, manual_mode: str) -> dict[str, Any]:
        try:
            normalized_mode = normalize_manual_inspection_mode(manual_mode)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        async with self._state_lock:
            self.inspection_settings.manual_mode = normalized_mode
            payload = self._serialize_inspection_settings_locked()
            self.storage.save_json_setting("inspection_settings", payload)
        await self.publish_event("state_updated", {"inspection_settings": payload})
        return payload

    async def ui_snapshot(self) -> dict[str, Any]:
        async with self._state_lock:
            return self._serialize_ui_locked()

    async def set_ui_camera(self, center_x: float, center_y: float, zoom: float) -> dict[str, Any]:
        async with self._state_lock:
            self._apply_ui_camera_locked(center_x=center_x, center_y=center_y, zoom=zoom)
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def select_poi(self, poi_id: str | None) -> dict[str, Any]:
        async with self._state_lock:
            validated_poi_id = self._validate_optional_poi_id_locked(poi_id)
            self.ui_state.selected_poi_id = validated_poi_id
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def highlight_pois(
        self, poi_ids: list[str], *, selected_poi_id: str | None = None
    ) -> dict[str, Any]:
        async with self._state_lock:
            self.ui_state.highlighted_poi_ids = self._normalize_poi_ids_locked(poi_ids)
            self.ui_state.selected_poi_id = self._validate_optional_poi_id_locked(selected_poi_id)
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def clear_ui_focus(self) -> dict[str, Any]:
        async with self._state_lock:
            self.ui_state.selected_poi_id = None
            self.ui_state.highlighted_poi_ids = []
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def focus_poi(self, poi_id: str, zoom: float | None = None) -> dict[str, Any]:
        async with self._state_lock:
            poi = self._require_active_poi_locked(poi_id)
            self.ui_state.selected_poi_id = poi.poi_id
            self.ui_state.highlighted_poi_ids = [poi.poi_id]
            self._apply_ui_camera_locked(
                center_x=poi.world_x,
                center_y=poi.world_y,
                zoom=zoom if zoom is not None else UI_FOCUS_POI_ZOOM,
            )
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def focus_robot(self, zoom: float | None = None) -> dict[str, Any]:
        async with self._state_lock:
            if self.robot_pose is None:
                raise HTTPException(status_code=409, detail="No robot pose available")
            self._apply_ui_camera_locked(
                center_x=self.robot_pose.x,
                center_y=self.robot_pose.y,
                zoom=zoom if zoom is not None else UI_FOCUS_ROBOT_ZOOM,
            )
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def focus_map(self) -> dict[str, Any]:
        async with self._state_lock:
            if self.map_state is None:
                raise HTTPException(status_code=404, detail="No active map available")
            center_x, center_y = self._map_center_locked()
            self._apply_ui_camera_locked(center_x=center_x, center_y=center_y, zoom=UI_MIN_ZOOM)
            payload = self._commit_ui_state_locked()
        await self.publish_event("ui_state_updated", payload)
        return payload

    async def save_map(self) -> dict[str, Any]:
        record = await self.flush_active_map(force=True)
        if record is None:
            raise HTTPException(status_code=400, detail="No active map to save")
        await self.publish_event("map_updated", self._serialize_map())
        return {"saved": True, "updated_at": record.updated_at}

    async def inspect_now(self) -> dict[str, Any]:
        async with self._state_lock:
            if self.inspection_state["status"] == "running":
                raise HTTPException(status_code=409, detail="Inspection already running")
            pose = self.robot_pose
            manual_mode = self.inspection_settings.manual_mode
            self.inspection_state = {"status": "running", "message": "Inspecting current view", "poi_id": None}
        await self.publish_event("inspection_updated", dict(self.inspection_state))

        if pose is None:
            await self._set_inspection_state("failed", "No robot pose available", None)
            raise HTTPException(status_code=409, detail="No robot pose available")

        try:
            image_bytes = await self._observe_jpeg()
            if image_bytes is None:
                raise RuntimeError("No image available from observe()")

            thumbnail_bytes = make_thumbnail(image_bytes)
            hero_path = self.storage.create_image_asset(image_bytes, ".jpg")
            thumb_path = self.storage.create_image_asset(thumbnail_bytes, ".jpg")
            dimos_image = jpeg_bytes_to_dimos_image(image_bytes)
            analysis = self.analyzer.analyze(dimos_image)
            payload_json = json.dumps(analysis.as_payload())
            effective_create_poi = analysis.should_create_poi
            gate_result = "accepted"
            gate_message = analysis.gate_reason
            if manual_mode == INSPECTION_MODE_ALWAYS_CREATE and not analysis.should_create_poi:
                effective_create_poi = True
                gate_result = "forced_accept"
                gate_message = f"Saved by manual override. AI note: {analysis.gate_reason}"
            elif not analysis.should_create_poi:
                gate_result = "rejected"

            poi: PoiRecord | None = None
            if effective_create_poi:
                async with self._state_lock:
                    duplicate = self._find_duplicate_poi_locked(analysis, pose)
                    if duplicate is not None:
                        poi = self._updated_poi_from_existing(
                            duplicate,
                            analysis,
                            pose,
                            hero_path,
                            thumb_path,
                        )
                    else:
                        map_id = self.map_state.map_id if self.map_state is not None else "active"
                        poi = self.storage.new_poi(
                            map_id=map_id,
                            world_x=pose.x,
                            world_y=pose.y,
                            world_yaw=pose.yaw,
                            title=analysis.title,
                            summary=analysis.summary,
                            category=analysis.category,
                            interest_score=analysis.interest_score,
                            thumbnail_path=thumb_path,
                            hero_image_path=hero_path,
                            objects=analysis.objects,
                        )

                    self.storage.upsert_poi(poi)
                    self.pois[poi.poi_id] = poi

                await self.publish_event("poi_upserted", self._serialize_poi(poi))
                await self.focus_poi(poi.poi_id, zoom=UI_FOCUS_POI_ZOOM)
                await self._set_inspection_state("accepted", gate_message, poi.poi_id)
            else:
                await self._set_inspection_state("rejected", gate_message, None)

            observation = self.storage.new_observation(
                poi_id=poi.poi_id if poi is not None else None,
                world_x=pose.x,
                world_y=pose.y,
                world_yaw=pose.yaw,
                image_path=hero_path,
                thumbnail_path=thumb_path,
                model_payload_json=payload_json,
                gate_result=gate_result,
            )
            self.storage.insert_observation(observation)
            return {
                "status": self.inspection_state["status"],
                "poi_id": poi.poi_id if poi is not None else None,
                "analysis": analysis.as_payload(),
                "manual_mode": manual_mode,
            }
        except (OpenAIError, aiohttp.ClientError, RuntimeError, ValueError) as exc:
            logger.exception("Inspect Now failed")
            await self._set_inspection_state("failed", str(exc), None)
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    async def delete_poi(self, poi_id: str) -> None:
        ui_payload: dict[str, Any] | None = None
        async with self._state_lock:
            poi = self.pois.get(poi_id)
            if poi is None:
                raise HTTPException(status_code=404, detail="POI not found")
            was_selected = self.ui_state.selected_poi_id == poi_id
            was_highlighted = poi_id in self.ui_state.highlighted_poi_ids
            self.storage.soft_delete_poi(poi_id)
            self.pois[poi_id] = PoiRecord(
                poi_id=poi.poi_id,
                map_id=poi.map_id,
                world_x=poi.world_x,
                world_y=poi.world_y,
                world_yaw=poi.world_yaw,
                title=poi.title,
                summary=poi.summary,
                category=poi.category,
                interest_score=poi.interest_score,
                status="deleted",
                thumbnail_path=poi.thumbnail_path,
                hero_image_path=poi.hero_image_path,
                objects_json=poi.objects_json,
                created_at=poi.created_at,
                updated_at=utc_now_iso(),
            )
            if was_selected:
                self.ui_state.selected_poi_id = None
            if was_highlighted:
                self.ui_state.highlighted_poi_ids = [
                    highlighted_id
                    for highlighted_id in self.ui_state.highlighted_poi_ids
                    if highlighted_id != poi_id
                ]
            if was_selected or was_highlighted:
                ui_payload = self._commit_ui_state_locked()
        await self.publish_event("poi_deleted", {"poi_id": poi_id})
        if ui_payload is not None:
            await self.publish_event("ui_state_updated", ui_payload)

    def resolve_asset(self, relative_path: str) -> Path:
        resolved = (self.state_dir / relative_path).resolve()
        state_root = self.state_dir.resolve()
        if state_root != resolved and state_root not in resolved.parents:
            raise HTTPException(status_code=404, detail="Asset not found")
        if not resolved.exists():
            raise HTTPException(status_code=404, detail="Asset not found")
        return resolved

    async def flush_active_map(self, force: bool = False) -> ActiveMapRecord | None:
        async with self._state_lock:
            if self.map_state is None:
                return None
            if not self._dirty_map and not force:
                return self.map_record

            preview = self.map_state.preview_png_bytes()
            record = self.storage.save_active_map(
                map_id=self.map_state.map_id,
                resolution=self.map_state.resolution,
                origin_x=self.map_state.origin_x,
                origin_y=self.map_state.origin_y,
                log_odds=self.map_state.log_odds,
                observation_count=self.map_state.observation_count,
                preview_png=preview,
            )
            self.map_record = record
            self.map_state.updated_at = record.updated_at
            self._dirty_map = False
            return record

    def _load_from_storage(self) -> None:
        record, log_odds, observation_count = self.storage.load_active_map()
        self.map_record = record
        settings = self.storage.load_json_setting("inspection_settings")
        if settings is not None:
            try:
                raw_manual_mode = settings.get("manual_mode", INSPECTION_MODE_AI_GATE)
                self.inspection_settings = InspectionSettings(
                    manual_mode=normalize_manual_inspection_mode(str(raw_manual_mode))
                )
            except ValueError:
                logger.warning("Ignoring invalid persisted inspection settings", settings=settings)
        if record is not None and log_odds is not None and observation_count is not None:
            self.map_state = ActiveMapState.from_arrays(
                map_id=record.map_id,
                resolution=record.resolution,
                origin_x=record.origin_x,
                origin_y=record.origin_y,
                log_odds=log_odds,
                observation_count=observation_count,
                updated_at=record.updated_at,
            )
        self.pois = {poi.poi_id: poi for poi in self.storage.list_pois(include_deleted=True)}
        if self.map_state is not None:
            center_x, center_y = self._map_center_locked()
            self.ui_state.camera = UiCameraState(center_x=center_x, center_y=center_y, zoom=1.0)

    async def _set_inspection_state(self, status: str, message: str, poi_id: str | None) -> None:
        async with self._state_lock:
            self.inspection_state = {"status": status, "message": message, "poi_id": poi_id}
        await self.publish_event("inspection_updated", dict(self.inspection_state))

    async def _handle_connection_change(self, connected: bool) -> None:
        async with self._state_lock:
            self.connected = connected
        await self.publish_event("state_updated", await self._state_delta())

    async def _handle_pose(self, pose: RobotPose) -> None:
        should_publish = False
        async with self._state_lock:
            self.robot_pose = pose
            now = time.monotonic()
            if now - self._last_pose_event > 0.2:
                self._last_pose_event = now
                should_publish = True
        if should_publish:
            await self.publish_event("state_updated", await self._state_delta())

    async def _handle_path(self, path: list[list[float]]) -> None:
        async with self._state_lock:
            self.path = path
        await self.publish_event("state_updated", await self._state_delta())

    async def _handle_raw_costmap(self, raw_costmap: RawCostmap) -> None:
        ui_payload: dict[str, Any] | None = None
        async with self._state_lock:
            if self.map_state is None:
                self.map_state = ActiveMapState.empty_from_extent(
                    map_id="active",
                    resolution=0.15,
                    min_x=raw_costmap.origin_x,
                    min_y=raw_costmap.origin_y,
                    max_x=raw_costmap.origin_x + raw_costmap.width * raw_costmap.resolution,
                    max_y=raw_costmap.origin_y + raw_costmap.height * raw_costmap.resolution,
                )
                center_x, center_y = self._map_center_locked()
                self.ui_state.camera = UiCameraState(center_x=center_x, center_y=center_y, zoom=1.0)
                ui_payload = self._commit_ui_state_locked()

            changed = self.map_state.update_from_costmap(raw_costmap)
            if not changed:
                if ui_payload is None:
                    return

            payload: dict[str, Any] | None = None
            if changed:
                self.map_state.updated_at = utc_now_iso()
                preview = self.map_state.preview_png_bytes()
                self.storage.write_active_map_preview(preview)
                self._dirty_map = True
                payload = self._serialize_map()

        if payload is not None:
            await self.publish_event("map_updated", payload)
        if ui_payload is not None:
            await self.publish_event("ui_state_updated", ui_payload)

    async def _pov_loop(self) -> None:
        while not self._stopped:
            try:
                image_bytes = await self._observe_jpeg()
                if image_bytes is not None:
                    async with self._state_lock:
                        self.latest_pov_jpeg = image_bytes
                        self.pov_seq += 1
                        self.pov_updated_at = utc_now_iso()
                    await self.publish_event("state_updated", await self._state_delta())
            except Exception as exc:
                logger.debug("POV polling failed", error=str(exc))
            await asyncio.sleep(0.5)

    async def _checkpoint_loop(self) -> None:
        while not self._stopped:
            await asyncio.sleep(10.0)
            try:
                await self.flush_active_map(force=False)
            except Exception:
                logger.exception("Periodic SLAMASS map checkpoint failed")

    async def _finish_poi_navigation(
        self,
        *,
        poi_id: str,
        target_x: float,
        target_y: float,
        target_yaw: float,
    ) -> None:
        try:
            arrived = await self._wait_for_poi_arrival(target_x=target_x, target_y=target_y)
            if not arrived:
                logger.warning(
                    "POI Go To timed out before reaching target pose",
                    poi_id=poi_id,
                    x=round(target_x, 3),
                    y=round(target_y, 3),
                )
                return

            async with self._state_lock:
                current_pose = self.robot_pose
            if current_pose is None:
                logger.warning("POI Go To lost robot pose before yaw restore", poi_id=poi_id)
                return

            rotation_degrees = math.degrees(angle_delta(target_yaw, current_pose.yaw))
            if abs(rotation_degrees) < self._poi_rotation_threshold_degrees:
                logger.info(
                    "POI Go To arrived already aligned with saved viewpoint",
                    poi_id=poi_id,
                    yaw_error_degrees=round(rotation_degrees, 1),
                )
                return

            logger.info(
                "POI Go To restoring saved viewpoint yaw",
                poi_id=poi_id,
                degrees=round(rotation_degrees, 1),
            )
            await self._relative_rotate(rotation_degrees)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("POI Go To yaw restoration failed", poi_id=poi_id)
        finally:
            current_task = asyncio.current_task()
            if self._goto_poi_task is current_task:
                self._goto_poi_task = None

    async def _wait_for_poi_arrival(self, *, target_x: float, target_y: float) -> bool:
        deadline = time.monotonic() + self._poi_arrival_timeout_seconds
        in_tolerance_since: float | None = None

        while not self._stopped and time.monotonic() < deadline:
            async with self._state_lock:
                pose = self.robot_pose

            if pose is not None:
                distance = math.hypot(pose.x - target_x, pose.y - target_y)
                if distance <= self._poi_arrival_tolerance_m:
                    if in_tolerance_since is None:
                        in_tolerance_since = time.monotonic()
                    elif time.monotonic() - in_tolerance_since >= self._poi_arrival_settle_seconds:
                        return True
                else:
                    in_tolerance_since = None

            await asyncio.sleep(0.25)

        return False

    async def _relative_rotate(self, degrees: float) -> None:
        result = self.mcp_client.relative_move(forward=0.0, left=0.0, degrees=degrees)
        if asyncio.iscoroutine(result):
            await result

    async def _observe_jpeg(self) -> bytes | None:
        result = self.mcp_client.observe_jpeg()
        if asyncio.iscoroutine(result):
            return await result
        return result

    async def _maybe_start_mcp_client(self) -> None:
        start = getattr(self.mcp_client, "start", None)
        if start is None:
            return
        result = start()
        if asyncio.iscoroutine(result):
            await result

    async def _maybe_stop_mcp_client(self) -> None:
        stop = getattr(self.mcp_client, "stop", None)
        if stop is None:
            return
        result = stop()
        if asyncio.iscoroutine(result):
            await result

    async def _state_delta(self) -> dict[str, Any]:
        async with self._state_lock:
            return {
                "connected": self.connected,
                "robot_pose": self._serialize_pose(self.robot_pose),
                "path": self.path,
                "pov": {
                    "available": self.latest_pov_jpeg is not None,
                    "seq": self.pov_seq,
                    "updated_at": self.pov_updated_at,
                    "image_url": f"/api/pov/latest.jpg?v={self.pov_seq}",
                },
                "inspection_settings": self._serialize_inspection_settings_locked(),
            }

    def _require_active_poi_locked(self, poi_id: str) -> PoiRecord:
        poi = self.pois.get(poi_id)
        if poi is None or poi.status == "deleted":
            raise HTTPException(status_code=404, detail="POI not found")
        return poi

    def _validate_optional_poi_id_locked(self, poi_id: str | None) -> str | None:
        if poi_id is None:
            return None
        return self._require_active_poi_locked(poi_id).poi_id

    def _normalize_poi_ids_locked(self, poi_ids: list[str]) -> list[str]:
        unique: list[str] = []
        seen: set[str] = set()
        for poi_id in poi_ids:
            validated = self._require_active_poi_locked(poi_id).poi_id
            if validated in seen:
                continue
            unique.append(validated)
            seen.add(validated)
        return unique

    def _map_center_locked(self) -> tuple[float, float]:
        assert self.map_state is not None
        return (
            self.map_state.origin_x + (self.map_state.width * self.map_state.resolution) / 2.0,
            self.map_state.origin_y + (self.map_state.height * self.map_state.resolution) / 2.0,
        )

    def _apply_ui_camera_locked(self, *, center_x: float, center_y: float, zoom: float) -> None:
        clamped_zoom = max(UI_MIN_ZOOM, min(UI_MAX_ZOOM, float(zoom)))
        if self.map_state is not None:
            min_x = self.map_state.origin_x
            max_x = self.map_state.origin_x + self.map_state.width * self.map_state.resolution
            min_y = self.map_state.origin_y
            max_y = self.map_state.origin_y + self.map_state.height * self.map_state.resolution
            center_x = min(max(center_x, min_x), max_x)
            center_y = min(max(center_y, min_y), max_y)
        self.ui_state.camera = UiCameraState(
            center_x=float(center_x),
            center_y=float(center_y),
            zoom=clamped_zoom,
        )

    def _commit_ui_state_locked(self) -> dict[str, Any]:
        self.ui_state.revision += 1
        return self._serialize_ui_locked()

    def _updated_poi_from_existing(
        self,
        existing: PoiRecord,
        analysis: InspectionAnalysis,
        pose: RobotPose,
        hero_path: str,
        thumb_path: str,
    ) -> PoiRecord:
        return self.storage.new_poi(
            map_id=existing.map_id,
            world_x=pose.x,
            world_y=pose.y,
            world_yaw=pose.yaw,
            title=analysis.title,
            summary=analysis.summary,
            category=analysis.category,
            interest_score=analysis.interest_score,
            thumbnail_path=thumb_path,
            hero_image_path=hero_path,
            objects=analysis.objects,
            poi_id=existing.poi_id,
            created_at=existing.created_at,
        )

    def _find_duplicate_poi_locked(
        self, analysis: InspectionAnalysis, pose: RobotPose
    ) -> PoiRecord | None:
        title = normalize_text(analysis.title)
        category = normalize_text(analysis.category)
        for poi in self._active_pois():
            if normalize_text(poi.category) != category:
                continue
            if normalize_text(poi.title) != title:
                continue
            distance = math.hypot(poi.world_x - pose.x, poi.world_y - pose.y)
            if distance > 1.5:
                continue
            if yaw_distance(poi.world_yaw, pose.yaw) > math.radians(45):
                continue
            return poi
        return None

    def _active_pois(self) -> list[PoiRecord]:
        return [poi for poi in self.pois.values() if poi.status != "deleted"]

    def _serialize_pose(self, pose: RobotPose | None) -> dict[str, Any] | None:
        if pose is None:
            return None
        return {"x": pose.x, "y": pose.y, "z": pose.z, "yaw": pose.yaw}

    def _serialize_map(self) -> dict[str, Any] | None:
        if self.map_state is None:
            return None
        return {
            "map_id": self.map_state.map_id,
            "resolution": self.map_state.resolution,
            "origin_x": self.map_state.origin_x,
            "origin_y": self.map_state.origin_y,
            "width": self.map_state.width,
            "height": self.map_state.height,
            "updated_at": self.map_state.updated_at,
            "image_version": self.map_state.image_version,
            "image_url": f"/api/map/active/preview.png?v={self.map_state.image_version}",
        }

    def _serialize_ui_locked(self) -> dict[str, Any]:
        return {
            "revision": self.ui_state.revision,
            "camera": {
                "center_x": self.ui_state.camera.center_x,
                "center_y": self.ui_state.camera.center_y,
                "zoom": self.ui_state.camera.zoom,
            },
            "selected_poi_id": self.ui_state.selected_poi_id,
            "highlighted_poi_ids": list(self.ui_state.highlighted_poi_ids),
        }

    def _serialize_inspection_settings_locked(self) -> dict[str, Any]:
        return {
            "manual_mode": self.inspection_settings.manual_mode,
        }

    def _serialize_poi(self, poi: PoiRecord) -> dict[str, Any]:
        return {
            "poi_id": poi.poi_id,
            "map_id": poi.map_id,
            "world_x": poi.world_x,
            "world_y": poi.world_y,
            "world_yaw": poi.world_yaw,
            "title": poi.title,
            "summary": poi.summary,
            "category": poi.category,
            "interest_score": poi.interest_score,
            "status": poi.status,
            "objects": poi.objects,
            "created_at": poi.created_at,
            "updated_at": poi.updated_at,
            "thumbnail_url": f"/api/assets/{poi.thumbnail_path}",
            "hero_image_url": f"/api/assets/{poi.hero_image_path}",
        }


def contextlib_suppress(*exceptions: type[BaseException]) -> Any:
    from contextlib import suppress

    return suppress(*exceptions)


def create_app(
    *,
    map_socket_url: str = "http://localhost:7779",
    mcp_url: str = "http://localhost:9990/mcp",
    state_dir: Path | None = None,
    model_name: str = "gpt-4o",
    service: SlamassService | None = None,
) -> FastAPI:
    _state_dir = state_dir or default_state_dir()
    slamass = service or SlamassService(
        map_socket_url=map_socket_url,
        mcp_url=mcp_url,
        state_dir=_state_dir,
        model_name=model_name,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:
        await slamass.start()
        try:
            yield
        finally:
            with contextlib_suppress(asyncio.CancelledError):
                await slamass.stop()

    app = FastAPI(lifespan=lifespan)
    app.state.slamass = slamass

    @app.get("/api/state")
    async def get_state() -> dict[str, Any]:
        return await slamass.snapshot()

    @app.get("/api/inspection-settings")
    async def get_inspection_settings() -> dict[str, Any]:
        async with slamass._state_lock:
            return slamass._serialize_inspection_settings_locked()

    @app.get("/api/ui")
    async def get_ui_state() -> dict[str, Any]:
        return await slamass.ui_snapshot()

    @app.get("/api/events")
    async def get_events() -> EventSourceResponse:
        queue = await slamass.subscribe()

        async def event_generator() -> Any:
            try:
                while True:
                    event = await queue.get()
                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"]),
                    }
            except asyncio.CancelledError:
                return
            finally:
                slamass.unsubscribe(queue)

        return EventSourceResponse(event_generator())

    @app.get("/api/pov/latest.jpg")
    async def get_latest_pov() -> Response:
        if slamass.latest_pov_jpeg is None:
            raise HTTPException(status_code=503, detail="No POV frame available yet")
        return Response(
            content=slamass.latest_pov_jpeg,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/map/active")
    async def get_active_map() -> dict[str, Any]:
        payload = slamass._serialize_map()
        if payload is None:
            raise HTTPException(status_code=404, detail="No active map available")
        return payload

    @app.get("/api/map/active/preview.png")
    async def get_active_map_preview() -> Response:
        if slamass.map_state is None:
            raise HTTPException(status_code=404, detail="No active map available")
        preview_path = slamass.storage.asset_path("maps/active_map.png")
        if preview_path.exists():
            return FileResponse(preview_path, media_type="image/png")
        return Response(content=slamass.map_state.preview_png_bytes(), media_type="image/png")

    @app.post("/api/map/save")
    async def post_save_map() -> dict[str, Any]:
        return await slamass.save_map()

    @app.put("/api/ui/camera")
    async def put_ui_camera(request: UiCameraRequest) -> dict[str, Any]:
        return await slamass.set_ui_camera(request.center_x, request.center_y, request.zoom)

    @app.post("/api/ui/select-poi")
    async def post_ui_select_poi(request: UiSelectionRequest) -> dict[str, Any]:
        return await slamass.select_poi(request.poi_id)

    @app.post("/api/ui/highlight-pois")
    async def post_ui_highlight_pois(request: UiHighlightRequest) -> dict[str, Any]:
        return await slamass.highlight_pois(
            request.poi_ids,
            selected_poi_id=request.selected_poi_id,
        )

    @app.post("/api/ui/clear-focus")
    async def post_ui_clear_focus() -> dict[str, Any]:
        return await slamass.clear_ui_focus()

    @app.post("/api/ui/focus-poi/{poi_id}")
    async def post_ui_focus_poi(poi_id: str, request: UiFocusRequest) -> dict[str, Any]:
        return await slamass.focus_poi(poi_id, zoom=request.zoom)

    @app.post("/api/ui/focus-robot")
    async def post_ui_focus_robot(request: UiFocusRequest) -> dict[str, Any]:
        return await slamass.focus_robot(zoom=request.zoom)

    @app.post("/api/ui/focus-map")
    async def post_ui_focus_map() -> dict[str, Any]:
        return await slamass.focus_map()

    @app.post("/api/navigate")
    async def post_navigate(request: NavigateRequest) -> dict[str, Any]:
        await slamass.navigate(request.x, request.y, request.yaw)
        return {"ok": True}

    @app.post("/api/inspect/now")
    async def post_inspect_now() -> dict[str, Any]:
        return await slamass.inspect_now()

    @app.put("/api/inspection-settings")
    async def put_inspection_settings(request: InspectionSettingsRequest) -> dict[str, Any]:
        return await slamass.set_manual_inspection_mode(request.manual_mode)

    @app.get("/api/pois")
    async def get_pois() -> list[dict[str, Any]]:
        return [slamass._serialize_poi(poi) for poi in slamass._active_pois()]

    @app.get("/api/pois/{poi_id}")
    async def get_poi(poi_id: str) -> dict[str, Any]:
        poi = slamass.pois.get(poi_id)
        if poi is None or poi.status == "deleted":
            raise HTTPException(status_code=404, detail="POI not found")
        return slamass._serialize_poi(poi)

    @app.post("/api/pois/{poi_id}/go")
    async def post_go_to_poi(poi_id: str) -> dict[str, Any]:
        await slamass.go_to_poi(poi_id)
        return {"ok": True}

    @app.post("/api/pois/{poi_id}/delete")
    async def post_delete_poi(poi_id: str) -> dict[str, Any]:
        await slamass.delete_poi(poi_id)
        return {"ok": True}

    @app.get("/api/assets/{relative_path:path}")
    async def get_asset(relative_path: str) -> Response:
        return FileResponse(slamass.resolve_asset(relative_path))

    dist_dir = Path(__file__).resolve().parents[1] / "web" / "slamass-app" / "dist"
    dist_assets = dist_dir / "assets"
    if dist_assets.exists():
        app.mount("/assets", StaticFiles(directory=str(dist_assets)), name="slamass_assets")

    @app.get("/{full_path:path}")
    async def serve_app(full_path: str) -> Response:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        if dist_dir.exists():
            requested = (dist_dir / full_path).resolve()
            if requested.exists() and requested.is_file() and dist_dir.resolve() in requested.parents:
                return FileResponse(requested)
            index_path = dist_dir / "index.html"
            if index_path.exists():
                return FileResponse(index_path)
        return Response(
            content=(
                "SLAMASS UI is not built yet. Run: "
                "cd dimos/web/slamass-app && npm install && npm run build"
            ),
            status_code=503,
            media_type="text/plain",
        )

    return app


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the SLAMASS sidecar service")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7780)
    parser.add_argument("--map-socket-url", default="http://localhost:7779")
    parser.add_argument("--mcp-url", default="http://localhost:9990/mcp")
    parser.add_argument("--state-dir", type=Path, default=default_state_dir())
    parser.add_argument("--model", default="gpt-4o")
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()
    uvicorn.run(
        create_app(
            map_socket_url=args.map_socket_url,
            mcp_url=args.mcp_url,
            state_dir=args.state_dir,
            model_name=args.model,
        ),
        host=args.host,
        port=args.port,
    )


__all__ = ["SlamassService", "create_app", "main"]
