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

import numpy as np

from dimos.slamass.map_memory import ActiveMapState, RawCostmap


def test_map_memory_clears_with_free_space() -> None:
    state = ActiveMapState.empty_from_extent(
        map_id="active",
        resolution=0.15,
        min_x=0.0,
        min_y=0.0,
        max_x=0.15,
        max_y=0.15,
    )

    occupied = RawCostmap(
        grid=np.full((3, 3), 100, dtype=np.int8),
        origin_x=0.0,
        origin_y=0.0,
        resolution=0.05,
        ts=0.0,
    )
    freed = RawCostmap(
        grid=np.zeros((3, 3), dtype=np.int8),
        origin_x=0.0,
        origin_y=0.0,
        resolution=0.05,
        ts=1.0,
    )

    assert state.update_from_costmap(occupied) is True
    assert float(state.log_odds[0, 0]) > 0.0

    assert state.update_from_costmap(freed) is True
    assert float(state.log_odds[0, 0]) < 0.0
    assert int(state.observation_count[0, 0]) == 2


def test_preview_png_is_generated() -> None:
    state = ActiveMapState.empty_from_extent(
        map_id="active",
        resolution=0.15,
        min_x=0.0,
        min_y=0.0,
        max_x=0.30,
        max_y=0.30,
    )
    state.log_odds[0, 0] = -2.0
    state.log_odds[1, 1] = 2.0
    state.observation_count[:, :] = 1

    preview = state.preview_png_bytes()

    assert preview.startswith(b"\x89PNG")
    assert len(preview) > 50
