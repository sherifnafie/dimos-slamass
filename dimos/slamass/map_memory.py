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
import io
import math

import numpy as np
from PIL import Image


OCCUPIED_THRESHOLD = 65
FREE_THRESHOLD = 25
LOG_ODDS_OCCUPIED = 0.85
LOG_ODDS_FREE = -1.15
LOG_ODDS_MIN = -6.0
LOG_ODDS_MAX = 6.0

# Preview PNG: light floor vs neutral structure grey (Polaris / Ops-style), not dark walls.
_PREVIEW_FREE_RGB = np.array([245, 247, 248], dtype=np.float32)  # #F5F7F8
_PREVIEW_OCCUPIED_RGB = np.array([233, 234, 235], dtype=np.float32)  # #E9EAEB

# Each grid cell becomes N×N PNG pixels (nearest-neighbor). UI still uses map width/height in cells;
# the browser scales the denser texture for sharper zoom / pixelated rendering.
MAP_PREVIEW_PIXELS_PER_CELL = 4


@dataclass(slots=True)
class RawCostmap:
    grid: np.ndarray
    origin_x: float
    origin_y: float
    resolution: float
    ts: float

    @property
    def width(self) -> int:
        return int(self.grid.shape[1])

    @property
    def height(self) -> int:
        return int(self.grid.shape[0])


@dataclass(slots=True)
class ActiveMapState:
    map_id: str
    resolution: float
    origin_x: float
    origin_y: float
    log_odds: np.ndarray
    observation_count: np.ndarray
    updated_at: str = ""
    image_version: int = 0

    @property
    def width(self) -> int:
        return int(self.log_odds.shape[1])

    @property
    def height(self) -> int:
        return int(self.log_odds.shape[0])

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return (
            self.origin_x,
            self.origin_y,
            self.origin_x + self.width * self.resolution,
            self.origin_y + self.height * self.resolution,
        )

    @classmethod
    def from_arrays(
        cls,
        *,
        map_id: str,
        resolution: float,
        origin_x: float,
        origin_y: float,
        log_odds: np.ndarray,
        observation_count: np.ndarray,
        updated_at: str = "",
        image_version: int = 0,
    ) -> ActiveMapState:
        return cls(
            map_id=map_id,
            resolution=resolution,
            origin_x=origin_x,
            origin_y=origin_y,
            log_odds=np.asarray(log_odds, dtype=np.float32),
            observation_count=np.asarray(observation_count, dtype=np.uint16),
            updated_at=updated_at,
            image_version=image_version,
        )

    @classmethod
    def empty_from_extent(
        cls,
        *,
        map_id: str,
        resolution: float,
        min_x: float,
        min_y: float,
        max_x: float,
        max_y: float,
    ) -> ActiveMapState:
        origin_x = math.floor(min_x / resolution) * resolution
        origin_y = math.floor(min_y / resolution) * resolution
        max_x_snapped = math.ceil(max_x / resolution) * resolution
        max_y_snapped = math.ceil(max_y / resolution) * resolution
        width = max(1, int(round((max_x_snapped - origin_x) / resolution)))
        height = max(1, int(round((max_y_snapped - origin_y) / resolution)))
        return cls(
            map_id=map_id,
            resolution=resolution,
            origin_x=origin_x,
            origin_y=origin_y,
            log_odds=np.zeros((height, width), dtype=np.float32),
            observation_count=np.zeros((height, width), dtype=np.uint16),
        )

    def ensure_extent(self, min_x: float, min_y: float, max_x: float, max_y: float) -> bool:
        current_min_x, current_min_y, current_max_x, current_max_y = self.bounds
        if (
            min_x >= current_min_x
            and min_y >= current_min_y
            and max_x <= current_max_x
            and max_y <= current_max_y
        ):
            return False

        new_min_x = min(min_x, current_min_x)
        new_min_y = min(min_y, current_min_y)
        new_max_x = max(max_x, current_max_x)
        new_max_y = max(max_y, current_max_y)

        expanded = self.empty_from_extent(
            map_id=self.map_id,
            resolution=self.resolution,
            min_x=new_min_x,
            min_y=new_min_y,
            max_x=new_max_x,
            max_y=new_max_y,
        )

        x_offset = int(round((current_min_x - expanded.origin_x) / self.resolution))
        y_offset = int(round((current_min_y - expanded.origin_y) / self.resolution))
        expanded.log_odds[
            y_offset : y_offset + self.height, x_offset : x_offset + self.width
        ] = self.log_odds
        expanded.observation_count[
            y_offset : y_offset + self.height, x_offset : x_offset + self.width
        ] = self.observation_count

        self.origin_x = expanded.origin_x
        self.origin_y = expanded.origin_y
        self.log_odds = expanded.log_odds
        self.observation_count = expanded.observation_count
        return True

    def update_from_costmap(self, raw: RawCostmap) -> bool:
        occupied_mask = raw.grid >= OCCUPIED_THRESHOLD
        free_mask = (raw.grid >= 0) & (raw.grid <= FREE_THRESHOLD)
        relevant_mask = occupied_mask | free_mask
        if not np.any(relevant_mask):
            return False

        left = raw.origin_x
        bottom = raw.origin_y
        right = raw.origin_x + raw.width * raw.resolution
        top = raw.origin_y + raw.height * raw.resolution
        self.ensure_extent(left, bottom, right, top)

        ys, xs = np.nonzero(relevant_mask)
        world_x = raw.origin_x + (xs.astype(np.float64) + 0.5) * raw.resolution
        world_y = raw.origin_y + (ys.astype(np.float64) + 0.5) * raw.resolution

        target_x = np.floor((world_x - self.origin_x) / self.resolution).astype(np.int32)
        target_y = np.floor((world_y - self.origin_y) / self.resolution).astype(np.int32)
        valid = (
            (target_x >= 0)
            & (target_x < self.width)
            & (target_y >= 0)
            & (target_y < self.height)
        )
        if not np.any(valid):
            return False

        target_x = target_x[valid]
        target_y = target_y[valid]
        flat_index = target_y * self.width + target_x

        occ_values = occupied_mask[ys[valid], xs[valid]]
        free_values = free_mask[ys[valid], xs[valid]]

        occ_counts = np.bincount(flat_index[occ_values], minlength=self.width * self.height)
        free_counts = np.bincount(flat_index[free_values], minlength=self.width * self.height)
        touched = np.nonzero(occ_counts + free_counts)[0]
        if touched.size == 0:
            return False

        log_odds_flat = self.log_odds.reshape(-1)
        obs_flat = self.observation_count.reshape(-1)
        occ_dom = occ_counts[touched] > free_counts[touched]
        free_dom = free_counts[touched] > occ_counts[touched]

        if np.any(occ_dom):
            occ_idx = touched[occ_dom]
            log_odds_flat[occ_idx] = np.clip(
                log_odds_flat[occ_idx] + LOG_ODDS_OCCUPIED,
                LOG_ODDS_MIN,
                LOG_ODDS_MAX,
            )
            obs_flat[occ_idx] = np.minimum(obs_flat[occ_idx] + 1, np.iinfo(np.uint16).max)

        if np.any(free_dom):
            free_idx = touched[free_dom]
            log_odds_flat[free_idx] = np.clip(
                log_odds_flat[free_idx] + LOG_ODDS_FREE,
                LOG_ODDS_MIN,
                LOG_ODDS_MAX,
            )
            obs_flat[free_idx] = np.minimum(obs_flat[free_idx] + 1, np.iinfo(np.uint16).max)

        self.image_version += 1
        return bool(np.any(occ_dom) or np.any(free_dom))

    def preview_png_bytes(self) -> bytes:
        probability = 1.0 / (1.0 + np.exp(-self.log_odds))
        known = self.observation_count > 0

        rgba = np.zeros((self.height, self.width, 4), dtype=np.uint8)
        free_rgb = _PREVIEW_FREE_RGB
        occupied_rgb = _PREVIEW_OCCUPIED_RGB

        if np.any(known):
            probs = probability[known].astype(np.float32)[:, None]
            colors = free_rgb * (1.0 - probs) + occupied_rgb * probs
            rgba_known = np.clip(colors, 0, 255).astype(np.uint8)
            rgba[known, 0] = rgba_known[:, 0]
            rgba[known, 1] = rgba_known[:, 1]
            rgba[known, 2] = rgba_known[:, 2]
            rgba[known, 3] = 255

        scale = max(1, int(MAP_PREVIEW_PIXELS_PER_CELL))
        if scale > 1:
            rgba = np.repeat(np.repeat(rgba, scale, axis=0), scale, axis=1)

        flipped = np.flipud(rgba)
        image = Image.fromarray(flipped, mode="RGBA")
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()
