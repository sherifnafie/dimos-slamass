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

from dataclasses import dataclass, field

import cv2
import numpy as np

from dimos.msgs.sensor_msgs import Image
from dimos.perception.detection.type.detection3d.pointcloud import Detection3DPC


def _encode_crop_jpeg(image: Image, *, max_width: int = 256, quality: int = 78) -> bytes:
    """Encode a cropped detection image to a compact JPEG payload."""
    crop = image.to_bgr().to_opencv()
    if crop.size == 0:
        return b""

    height, width = crop.shape[:2]
    if width > max_width and width > 0:
        scale = max_width / width
        target_size = (max(1, int(round(width * scale))), max(1, int(round(height * scale))))
        crop = cv2.resize(crop, target_size, interpolation=cv2.INTER_AREA)

    success, encoded = cv2.imencode(
        ".jpg",
        crop,
        [int(cv2.IMWRITE_JPEG_QUALITY), quality],
    )
    if not success:
        return b""
    return encoded.tobytes()


@dataclass(slots=True)
class SlamassYoloDetection:
    track_id: int
    class_id: int
    label: str
    confidence: float
    world_x: float
    world_y: float
    world_z: float
    size_x: float
    size_y: float
    size_z: float
    crop_jpeg: bytes = b""

    @classmethod
    def from_detection(cls, detection: Detection3DPC) -> SlamassYoloDetection:
        size_x, size_y, size_z = detection.get_bounding_box_dimensions()
        crop_jpeg = _encode_crop_jpeg(detection.cropped_image())
        center = detection.center
        return cls(
            track_id=int(detection.track_id),
            class_id=int(detection.class_id),
            label=str(detection.name),
            confidence=float(detection.confidence),
            world_x=float(center.x),
            world_y=float(center.y),
            world_z=float(center.z),
            size_x=float(size_x),
            size_y=float(size_y),
            size_z=float(size_z),
            crop_jpeg=crop_jpeg,
        )


@dataclass(slots=True)
class SlamassYoloDetections:
    ts: float
    detections: list[SlamassYoloDetection] = field(default_factory=list)

    @classmethod
    def from_detection_batch(cls, detections: list[Detection3DPC], *, ts: float) -> SlamassYoloDetections:
        return cls(
            ts=ts,
            detections=[SlamassYoloDetection.from_detection(detection) for detection in detections],
        )


__all__ = ["SlamassYoloDetection", "SlamassYoloDetections"]
