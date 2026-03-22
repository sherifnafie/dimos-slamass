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

from dimos.web.websocket_vis.websocket_vis_module import _move_command_has_manual_motion


def test_move_command_has_manual_motion_detects_non_zero_values() -> None:
    assert _move_command_has_manual_motion(
        {
            "linear": {"x": 0.0, "y": 0.2, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
        }
    )


def test_move_command_has_manual_motion_ignores_zero_values() -> None:
    assert not _move_command_has_manual_motion(
        {
            "linear": {"x": 0.0, "y": 0.0, "z": 0.0},
            "angular": {"x": 0.0, "y": 0.0, "z": 0.0},
        }
    )
