#!/usr/bin/env python3
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

from dimos.agents.mcp.mcp_server import McpServer
from dimos.core.blueprints import autoconnect
from dimos.core.transport import pLCMTransport
from dimos.perception.detection.detectors.yoloe import Yoloe2DDetector, YoloePromptMode
from dimos.perception.detection.module3D import Detection3DModule
from dimos.perception.detection.module3D import detection3d_module
from dimos.robot.unitree.go2.blueprints.smart.unitree_go2 import unitree_go2
from dimos.robot.unitree.go2.connection import GO2Connection
from dimos.robot.unitree.unitree_skill_container import unitree_skills
from dimos.web.websocket_vis.websocket_vis_module import WebsocketVisModule


def _slamass_detector() -> Yoloe2DDetector:
    return Yoloe2DDetector(
        model_name="yoloe-11l-seg-pf.pt",
        prompt_mode=YoloePromptMode.LRPC,
    )


unitree_go2_slamass_mcp = autoconnect(
    unitree_go2,
    detection3d_module(
        camera_info=GO2Connection.camera_info_static,
        detector=_slamass_detector,
        max_freq=2,
    ),
    McpServer.blueprint(),
    unitree_skills(),
).remappings(
    [
        (Detection3DModule, "pointcloud", "global_map"),
    ]
).transports(
    {
        ("slamass_yolo_detections", Detection3DModule): pLCMTransport("/slamass/yolo_detections"),
        ("slamass_yolo_detections", WebsocketVisModule): pLCMTransport("/slamass/yolo_detections"),
    }
)

__all__ = ["unitree_go2_slamass_mcp"]
