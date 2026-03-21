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

"""
Simple wavefront frontier exploration algorithm implementation using dimos types.

This module provides frontier detection and exploration goal selection
for autonomous navigation using the dimos Costmap and Vector types.
"""

from collections import deque
from dataclasses import dataclass
from enum import IntFlag
import threading
import time
from typing import Any

from dimos_lcm.std_msgs import Bool
import numpy as np
from reactivex.disposable import Disposable

from dimos.agents.annotation import skill
from dimos.core.core import rpc
from dimos.core.module import Module, ModuleConfig
from dimos.core.stream import In, Out
from dimos.mapping.occupancy.inflation import simple_inflate
from dimos.msgs.geometry_msgs.PoseStamped import PoseStamped
from dimos.msgs.geometry_msgs.Vector3 import Vector3
from dimos.msgs.nav_msgs.OccupancyGrid import CostValues, OccupancyGrid
from dimos.msgs.nav_msgs.Path import Path
from dimos.navigation.base import NavigationState
from dimos.navigation.replanning_a_star.min_cost_astar import min_cost_astar
from dimos.utils.logging_config import setup_logger
from dimos.utils.transform_utils import get_distance

logger = setup_logger()


class PointClassification(IntFlag):
    """Point classification flags for frontier detection algorithm."""

    NoInformation = 0
    MapOpen = 1
    MapClosed = 2
    FrontierOpen = 4
    FrontierClosed = 8


@dataclass
class GridPoint:
    """Represents a point in the grid map with classification."""

    x: int
    y: int
    classification: int = PointClassification.NoInformation


@dataclass(slots=True)
class CandidateTrajectory:
    goal: Vector3
    path: Path
    path_length_m: float
    segment_id: str
    direction: int
    entry_end: str
    label: str
    frontier_rank: int
    continuity_score: float
    failure_count: int


class FrontierCache:
    """Cache for grid points to avoid duplicate point creation."""

    def __init__(self) -> None:
        self.points = {}  # type: ignore[var-annotated]

    def get_point(self, x: int, y: int) -> GridPoint:
        """Get or create a grid point at the given coordinates."""
        key = (x, y)
        if key not in self.points:
            self.points[key] = GridPoint(x, y)
        return self.points[key]  # type: ignore[no-any-return]

    def clear(self) -> None:
        """Clear the point cache."""
        self.points.clear()


class WavefrontConfig(ModuleConfig):
    min_frontier_perimeter: float = 0.5
    occupancy_threshold: int = 99
    safe_distance: float = 3.0
    lookahead_distance: float = 5.0
    max_explored_distance: float = 10.0
    info_gain_threshold: float = 0.03
    num_no_gain_attempts: int = 2
    goal_timeout: float = 15.0
    watchdog_interval: float = 1.0
    idle_goal_timeout: float = 3.0
    progress_stall_timeout: float = 8.0
    recovery_cooldown: float = 1.0
    done_confirmation_cycles: int = 5
    progress_distance_threshold: float = 0.2
    progress_info_gain_cells: int = 20
    frontier_reacquire_distance: float = 0.75
    stuck_progress_radius: float = 0.4
    stuck_timeout: float = 14.0
    following_path_stuck_timeout: float = 28.0
    target_invalidation_timeout: float = 2.5
    target_invalidation_failures: int = 2
    shadowed_target_progress_timeout: float = 9.0
    same_wall_recovery_local_radius: float = 1.25
    same_wall_recovery_far_radius: float = 3.0
    trajectory_waypoint_spacing: float = 1.0
    max_committed_plan_failures: int = 3
    max_committed_recovery_failures: int = 2
    candidate_evaluation_limit: int = 4
    candidate_tie_margin: float = 0.35


class WavefrontFrontierExplorer(Module[WavefrontConfig]):
    """
    Wavefront frontier exploration algorithm implementation.

    This class encapsulates the frontier detection and exploration goal selection
    functionality using the wavefront algorithm with BFS exploration.

    Inputs:
        - costmap: Current costmap for frontier detection
        - odometry: Current robot pose

    Outputs:
        - goal_request: Exploration goals sent to the navigator
    """

    default_config = WavefrontConfig

    # LCM inputs
    global_costmap: In[OccupancyGrid]
    odom: In[PoseStamped]
    goal_reached: In[Bool]
    explore_cmd: In[Bool]
    stop_explore_cmd: In[Bool]

    # LCM outputs
    goal_request: Out[PoseStamped]

    rpc_calls: list[str] = [
        "NavigationInterface.get_state",
        "NavigationInterface.cancel_goal",
    ]

    def __init__(self, **kwargs: Any) -> None:
        """
        Initialize the frontier explorer.

        Args:
            min_frontier_perimeter: Minimum perimeter in meters to consider a valid frontier
            occupancy_threshold: Cost threshold above which a cell is considered occupied (0-255)
            safe_distance: Safe distance from obstacles for scoring (meters)
            info_gain_threshold: Minimum percentage increase in costmap information required to continue exploration (0.05 = 5%)
            num_no_gain_attempts: Maximum number of consecutive attempts with no information gain
        """
        super().__init__(**kwargs)
        self._cache = FrontierCache()
        self.explored_goals = []  # type: ignore[var-annotated]  # list of explored goals
        self.exploration_direction = Vector3(0.0, 0.0, 0.0)  # current exploration direction
        self.last_costmap = None  # store last costmap for information comparison
        self.no_gain_counter = 0  # track consecutive no-gain attempts

        # Latest data
        self.latest_costmap: OccupancyGrid | None = None
        self.latest_odometry: PoseStamped | None = None

        # Goal reached event
        self.goal_reached_event = threading.Event()
        self.replan_requested = threading.Event()
        self._planning_lock = threading.Lock()

        # Exploration state
        self.exploration_active = False
        self.exploration_thread: threading.Thread | None = None
        self.watchdog_thread: threading.Thread | None = None
        self.stop_event = threading.Event()
        self.current_state = "idle"
        self.active_nav_goal: PoseStamped | None = None
        self.current_frontier_goal: Vector3 | None = None
        self.current_frontier_id: str | None = None
        self.last_goal_publish_time: float | None = None
        self.last_progress_time = time.monotonic()
        self.last_progress_pose: Vector3 | None = None
        self.last_progress_info_count: int | None = None
        self.remaining_frontiers = 0
        self.done_streak = 0
        self.done_confidence = False
        self.recovery_state = "none"
        self.recovery_attempts = 0
        self.intentional_cooldown_until = 0.0
        self.goals_published = 0
        self.no_frontier_streak = 0
        self.trajectory_failure_counts: dict[str, int] = {}

        self.commitment_active = False
        self.committed_wall_segment_id: str | None = None
        self.committed_direction: int | None = None
        self.committed_entry_end: str | None = None
        self.committed_path_id = 0
        self.committed_start_time: float | None = None
        self.committed_last_progress_time: float | None = None
        self.committed_last_goal_publish_time: float | None = None
        self.committed_waypoint_index = 0
        self.committed_waypoints: list[PoseStamped] = []
        self.committed_end_target: Vector3 | None = None
        self.committed_path_length_m: float | None = None
        self.committed_plan_failures = 0
        self.committed_recovery_failures = 0
        self.committed_target_invalid_since: float | None = None
        self.committed_target_invalid_reason: str | None = None
        self.committed_target_invalid_count = 0

    @rpc
    def start(self) -> None:
        super().start()

        unsub = self.global_costmap.subscribe(self._on_costmap)
        self._disposables.add(Disposable(unsub))

        unsub = self.odom.subscribe(self._on_odometry)
        self._disposables.add(Disposable(unsub))

        if self.goal_reached.transport is not None:
            unsub = self.goal_reached.subscribe(self._on_goal_reached)
            self._disposables.add(Disposable(unsub))

        if self.explore_cmd.transport is not None:
            unsub = self.explore_cmd.subscribe(self._on_explore_cmd)
            self._disposables.add(Disposable(unsub))

        if self.stop_explore_cmd.transport is not None:
            unsub = self.stop_explore_cmd.subscribe(self._on_stop_explore_cmd)
            self._disposables.add(Disposable(unsub))

    @rpc
    def stop(self) -> None:
        self.stop_exploration()
        super().stop()

    def _on_costmap(self, msg: OccupancyGrid) -> None:
        """Handle incoming costmap messages."""
        self.latest_costmap = msg
        self._update_progress_from_costmap(msg)

    def _on_odometry(self, msg: PoseStamped) -> None:
        """Handle incoming odometry messages."""
        self.latest_odometry = msg
        self._update_progress_from_odometry(msg)

    def _on_goal_reached(self, msg: Bool) -> None:
        """Handle goal reached messages."""
        if msg.data:
            self.goal_reached_event.set()

    def _on_explore_cmd(self, msg: Bool) -> None:
        """Handle exploration command messages."""
        if msg.data:
            logger.info("Received exploration start command via LCM")
            self.explore()

    def _on_stop_explore_cmd(self, msg: Bool) -> None:
        """Handle stop exploration command messages."""
        if msg.data:
            logger.info("Received exploration stop command via LCM")
            self.stop_exploration()

    def _seconds_since(self, timestamp: float | None) -> float | None:
        if timestamp is None:
            return None
        return max(0.0, time.monotonic() - timestamp)

    def _goal_id(self, goal: Vector3 | None) -> str | None:
        if goal is None:
            return None
        return f"{goal.x:.2f},{goal.y:.2f}"

    def _pose_to_vector(self, pose: PoseStamped) -> Vector3:
        return Vector3(pose.x, pose.y, pose.z)

    def _make_goal_msg(self, goal: Vector3 | PoseStamped) -> PoseStamped:
        if isinstance(goal, PoseStamped):
            return PoseStamped(
                position=[goal.x, goal.y, goal.z],
                orientation=[
                    goal.orientation.x,
                    goal.orientation.y,
                    goal.orientation.z,
                    goal.orientation.w,
                ],
                frame_id=goal.frame_id or "world",
                ts=(
                    self.latest_costmap.ts
                    if self.latest_costmap is not None
                    else goal.ts
                ),
            )

        return PoseStamped(
            position=[goal.x, goal.y, 0.0],
            orientation=[0.0, 0.0, 0.0, 1.0],
            frame_id="world",
            ts=self.latest_costmap.ts if self.latest_costmap is not None else time.time(),
        )

    def _compute_path_length(self, path: Path | None) -> float:
        if path is None or len(path.poses) < 2:
            return 0.0

        total = 0.0
        for start, end in zip(path.poses, path.poses[1:], strict=False):
            total += get_distance(self._pose_to_vector(start), self._pose_to_vector(end))
        return total

    def _build_committed_waypoints(self, path: Path) -> list[PoseStamped]:
        if not path.poses:
            return []
        # The navigation stack already owns path following and local replanning.
        # The explorer should commit to the selected endpoint, not churn through
        # intermediate subgoals at the high level.
        return [self._make_goal_msg(path.poses[-1])]

    def _compute_candidate_direction(
        self, robot_pose: Vector3, goal: Vector3
    ) -> tuple[int, float]:
        direction = Vector3(goal.x - robot_pose.x, goal.y - robot_pose.y, 0.0)
        magnitude = direction.length()
        if magnitude <= 1e-6:
            return 1, 0.0

        normalized = direction / magnitude
        if self.exploration_direction.length() <= 1e-6:
            return 1, 0.0

        continuity = self.exploration_direction.dot(normalized)
        return (1 if continuity >= 0.0 else -1), continuity

    def _record_progress(self, reason: str, **kwargs: Any) -> None:
        now = time.monotonic()
        self.last_progress_time = now
        if self.commitment_active:
            self.committed_last_progress_time = now
        self.done_streak = 0
        self.done_confidence = False
        self.no_gain_counter = 0
        self.no_frontier_streak = 0
        self.recovery_attempts = 0
        logger.info("Exploration progress", reason=reason, **kwargs)

    def _update_progress_from_odometry(self, msg: PoseStamped) -> None:
        current_pose = Vector3(msg.position.x, msg.position.y, msg.position.z)
        if not self.exploration_active:
            self.last_progress_pose = current_pose
            return

        if self.last_progress_pose is None:
            self.last_progress_pose = current_pose
            return

        distance = get_distance(current_pose, self.last_progress_pose)
        progress_threshold = (
            self.config.stuck_progress_radius
            if self.commitment_active
            else self.config.progress_distance_threshold
        )
        if distance >= progress_threshold:
            self.last_progress_pose = current_pose
            self._record_progress("movement", distance=round(distance, 3))

    def _update_progress_from_costmap(self, msg: OccupancyGrid) -> None:
        current_info = self._count_costmap_information(msg)
        if not self.exploration_active:
            self.last_progress_info_count = current_info
            return

        if self.last_progress_info_count is None:
            self.last_progress_info_count = current_info
            return

        info_gain = current_info - self.last_progress_info_count
        if info_gain >= self.config.progress_info_gain_cells:
            self.last_progress_info_count = current_info
            self._record_progress("map_gain", cells=info_gain)

    def _get_navigation_state(self):
        try:
            get_state_rpc = self.get_rpc_calls("NavigationInterface.get_state")
        except Exception:
            return None

        try:
            return get_state_rpc()
        except Exception:
            logger.exception("Failed to query navigation state")
            return None

    def _cancel_navigation_goal(self, reason: str) -> None:
        try:
            cancel_goal_rpc = self.get_rpc_calls("NavigationInterface.cancel_goal")
        except Exception:
            return

        try:
            cancel_goal_rpc()
            logger.info("Cancelled navigation goal for exploration recovery", reason=reason)
        except Exception:
            logger.exception("Failed to cancel navigation goal", reason=reason)

    def _estimate_remaining_frontiers(self) -> int:
        if self.latest_costmap is None or self.latest_odometry is None:
            return 0

        robot_pose = Vector3(
            self.latest_odometry.position.x, self.latest_odometry.position.y, 0.0
        )
        costmap = simple_inflate(self.latest_costmap, 0.25)

        with self._planning_lock:
            return len(self.detect_frontiers(robot_pose, costmap))

    def _choose_recovery_goal(self, frontiers: list[Vector3]) -> tuple[Vector3 | None, str]:
        if not frontiers:
            return None, "no_frontier"

        previous_goal = self.current_frontier_goal
        if previous_goal is None:
            return frontiers[0], "best_frontier"

        if self.recovery_state != "none":
            if self.recovery_attempts <= 1:
                return previous_goal, "retry_same_frontier"

            for frontier in frontiers:
                if get_distance(frontier, previous_goal) <= self.config.frontier_reacquire_distance:
                    return frontier, "reacquire_same_frontier"

            return frontiers[0], "switch_frontier"

        return frontiers[0], "best_frontier"

    def _build_candidate_trajectories(
        self, robot_pose: Vector3, costmap: OccupancyGrid
    ) -> list[CandidateTrajectory]:
        with self._planning_lock:
            frontiers = self.detect_frontiers(robot_pose, costmap)

        self.remaining_frontiers = len(frontiers)
        self.last_costmap = costmap  # type: ignore[assignment]

        candidates: list[CandidateTrajectory] = []
        for rank, frontier in enumerate(frontiers[: self.config.candidate_evaluation_limit]):
            path = min_cost_astar(
                costmap,
                goal=frontier,
                start=robot_pose,
                cost_threshold=self.config.occupancy_threshold + 1,
            )
            if path is None or not path:
                logger.info(
                    "Trajectory candidate unreachable",
                    frontier_id=self._goal_id(frontier),
                    frontier_rank=rank,
                )
                continue

            segment_id = self._goal_id(frontier) or f"frontier_{rank}"
            direction, continuity = self._compute_candidate_direction(robot_pose, frontier)
            label = chr(ord("A") + rank) if rank < 26 else f"C{rank}"
            candidates.append(
                CandidateTrajectory(
                    goal=frontier,
                    path=path,
                    path_length_m=self._compute_path_length(path),
                    segment_id=segment_id,
                    direction=direction,
                    entry_end=label,
                    label=label,
                    frontier_rank=rank,
                    continuity_score=continuity,
                    failure_count=self.trajectory_failure_counts.get(segment_id, 0),
                )
            )

        return candidates

    def _prefer_candidate(
        self,
        candidate: CandidateTrajectory,
        incumbent: CandidateTrajectory | None,
    ) -> bool:
        if incumbent is None:
            return True

        length_delta = candidate.path_length_m - incumbent.path_length_m
        if length_delta < -self.config.candidate_tie_margin:
            return True
        if length_delta > self.config.candidate_tie_margin:
            return False

        if candidate.continuity_score > incumbent.continuity_score + 1e-6:
            return True
        if candidate.continuity_score < incumbent.continuity_score - 1e-6:
            return False

        if candidate.failure_count < incumbent.failure_count:
            return True
        if candidate.failure_count > incumbent.failure_count:
            return False

        if candidate.frontier_rank < incumbent.frontier_rank:
            return True
        if candidate.frontier_rank > incumbent.frontier_rank:
            return False

        return candidate.path_length_m < incumbent.path_length_m

    def _select_candidate_trajectory(
        self, robot_pose: Vector3, costmap: OccupancyGrid, reason: str
    ) -> CandidateTrajectory | None:
        candidates = self._build_candidate_trajectories(robot_pose, costmap)
        if not candidates:
            return None

        selected: CandidateTrajectory | None = None
        for candidate in candidates:
            if self._prefer_candidate(candidate, selected):
                selected = candidate

        candidate_costs = ", ".join(
            f"{candidate.entry_end}:{candidate.path_length_m:.2f}m"
            for candidate in candidates
        )
        logger.info(
            "Trajectory candidates evaluated",
            reason=reason,
            costs=candidate_costs,
            selected=selected.entry_end if selected is not None else None,
        )
        return selected

    def _reset_committed_target_invalidation(self) -> None:
        self.committed_target_invalid_since = None
        self.committed_target_invalid_reason = None
        self.committed_target_invalid_count = 0

    def _note_committed_target_invalidation(self, reason: str) -> tuple[float, int]:
        now = time.monotonic()
        if self.committed_target_invalid_reason != reason:
            self.committed_target_invalid_reason = reason
            self.committed_target_invalid_since = now
            self.committed_target_invalid_count = 1
            return 0.0, 1

        if self.committed_target_invalid_since is None:
            self.committed_target_invalid_since = now

        self.committed_target_invalid_count += 1
        return now - self.committed_target_invalid_since, self.committed_target_invalid_count

    def _find_same_wall_replacement(
        self, robot_pose: Vector3, costmap: OccupancyGrid
    ) -> CandidateTrajectory | None:
        if self.committed_end_target is None:
            return None

        with self._planning_lock:
            frontiers = self.detect_frontiers(robot_pose, costmap)

        for search_radius in (
            self.config.same_wall_recovery_local_radius,
            self.config.same_wall_recovery_far_radius,
        ):
            replacements: list[tuple[int, float, float, int, CandidateTrajectory]] = []

            for rank, frontier in enumerate(frontiers):
                distance_to_target = get_distance(frontier, self.committed_end_target)
                if distance_to_target < 0.05 or distance_to_target > search_radius:
                    continue

                path = min_cost_astar(
                    costmap,
                    goal=frontier,
                    start=robot_pose,
                    cost_threshold=self.config.occupancy_threshold + 1,
                )
                if path is None or not path:
                    continue

                direction, continuity = self._compute_candidate_direction(robot_pose, frontier)
                forward_penalty = 0
                if self.committed_direction is not None and direction != self.committed_direction:
                    forward_penalty = 1

                replacement = CandidateTrajectory(
                    goal=frontier,
                    path=path,
                    path_length_m=self._compute_path_length(path),
                    segment_id=self.committed_wall_segment_id
                    or self._goal_id(frontier)
                    or f"frontier_{rank}",
                    direction=self.committed_direction or direction,
                    entry_end=self.committed_entry_end or "A",
                    label=self.committed_entry_end or "A",
                    frontier_rank=rank,
                    continuity_score=continuity,
                    failure_count=self.trajectory_failure_counts.get(
                        self.committed_wall_segment_id or "", 0
                    ),
                )
                replacements.append(
                    (
                        forward_penalty,
                        distance_to_target,
                        replacement.path_length_m,
                        rank,
                        replacement,
                    )
                )

            if replacements:
                replacements.sort(key=lambda item: item[:4])
                return replacements[0][4]

        return None

    def _apply_same_wall_replacement(
        self, replacement: CandidateTrajectory, reason: str
    ) -> bool:
        old_target = self.committed_end_target
        self.committed_end_target = replacement.goal
        self.current_frontier_goal = replacement.goal
        self.current_frontier_id = self.committed_wall_segment_id
        self.committed_waypoints = self._build_committed_waypoints(replacement.path)
        self.committed_waypoint_index = 0
        self.committed_path_id += 1
        self.committed_path_length_m = replacement.path_length_m
        self.committed_last_goal_publish_time = None
        self.committed_plan_failures = 0
        self.committed_recovery_failures = 0
        self._reset_committed_target_invalidation()
        logger.info(
            "Recover same wall",
            wall=self.committed_wall_segment_id,
            direction=self.committed_direction,
            reason=reason,
            old_waypoint=(
                f"{old_target.x:.2f},{old_target.y:.2f}" if old_target is not None else None
            ),
            new_waypoint=f"{replacement.goal.x:.2f},{replacement.goal.y:.2f}",
        )
        return self._publish_committed_waypoint("recover_same_wall")

    def _publish_navigation_goal(
        self,
        goal: Vector3 | PoseStamped,
        action: str,
        *,
        frontier_goal: Vector3 | None = None,
        frontier_id: str | None = None,
    ) -> None:
        goal_msg = self._make_goal_msg(goal)
        self.goal_reached_event.clear()
        self.goal_request.publish(goal_msg)
        self.active_nav_goal = goal_msg
        self.current_frontier_goal = frontier_goal or Vector3(goal_msg.x, goal_msg.y, goal_msg.z)
        self.current_frontier_id = frontier_id or self._goal_id(self.current_frontier_goal)
        now = time.monotonic()
        self.last_goal_publish_time = now
        if self.commitment_active:
            self.committed_last_goal_publish_time = now
        self.current_state = "navigating"
        self.goals_published += 1
        self.no_frontier_streak = 0
        self.done_streak = 0
        self.done_confidence = False
        logger.info(
            "Published navigation goal",
            x=round(goal_msg.x, 2),
            y=round(goal_msg.y, 2),
            frontier_id=self.current_frontier_id,
            action=action,
            recovery_state=self.recovery_state,
            recovery_attempts=self.recovery_attempts,
            remaining_frontiers=self.remaining_frontiers,
        )
        self.recovery_state = "none"
        self.recovery_attempts = 0

    def _publish_goal(self, goal: Vector3, action: str) -> None:
        self._publish_navigation_goal(goal, action)

    def _clear_commitment(self) -> None:
        self.commitment_active = False
        self.committed_wall_segment_id = None
        self.committed_direction = None
        self.committed_entry_end = None
        self.committed_waypoint_index = 0
        self.committed_waypoints = []
        self.committed_end_target = None
        self.committed_path_length_m = None
        self.committed_plan_failures = 0
        self.committed_recovery_failures = 0
        self.committed_start_time = None
        self.committed_last_progress_time = None
        self.committed_last_goal_publish_time = None
        self._reset_committed_target_invalidation()

    def _activate_commitment(self, candidate: CandidateTrajectory, reason: str) -> bool:
        self.commitment_active = True
        self.committed_wall_segment_id = candidate.segment_id
        self.committed_direction = candidate.direction
        self.committed_entry_end = candidate.entry_end
        self.committed_path_id += 1
        self.committed_start_time = time.monotonic()
        self.committed_last_progress_time = self.committed_start_time
        self.committed_waypoints = self._build_committed_waypoints(candidate.path)
        self.committed_waypoint_index = 0
        self.committed_end_target = candidate.goal
        self.committed_path_length_m = candidate.path_length_m
        self.committed_plan_failures = 0
        self.committed_recovery_failures = 0
        self._reset_committed_target_invalidation()
        self.current_frontier_goal = candidate.goal
        self.current_frontier_id = candidate.segment_id
        if self.latest_odometry is not None:
            robot_pose = Vector3(
                self.latest_odometry.position.x, self.latest_odometry.position.y, 0.0
            )
            self._update_exploration_direction(robot_pose, candidate.goal)
        self.mark_explored_goal(candidate.goal)
        logger.info(
            "Committed trajectory activated",
            wall=candidate.segment_id,
            direction=candidate.direction,
            entry_end=candidate.entry_end,
            path_length=round(candidate.path_length_m, 2),
            frontier_rank=candidate.frontier_rank,
            reason=reason,
        )
        return self._publish_committed_waypoint("commit")

    def _publish_committed_waypoint(self, action: str) -> bool:
        if (
            not self.commitment_active
            or self.committed_end_target is None
            or self.committed_wall_segment_id is None
        ):
            return False

        if self.committed_waypoint_index >= len(self.committed_waypoints):
            self._complete_commitment("trajectory_complete")
            return False

        waypoint = self.committed_waypoints[self.committed_waypoint_index]
        self._publish_navigation_goal(
            waypoint,
            action,
            frontier_goal=self.committed_end_target,
            frontier_id=self.committed_wall_segment_id,
        )
        logger.info(
            "Continue committed trajectory",
            wall=self.committed_wall_segment_id,
            direction=self.committed_direction,
            entry_end=self.committed_entry_end,
            waypoint=f"{self.committed_waypoint_index + 1}/{len(self.committed_waypoints)}",
            action=action,
        )
        return True

    def _complete_commitment(self, reason: str) -> None:
        wall = self.committed_wall_segment_id
        direction = self.committed_direction
        entry_end = self.committed_entry_end
        path_length = self.committed_path_length_m
        self.active_nav_goal = None
        self.current_state = "planning"
        self.intentional_cooldown_until = 0.0
        self._record_progress(reason, frontier_id=wall)
        self._clear_commitment()
        logger.info(
            "Trajectory complete",
            wall=wall,
            direction=direction,
            entry_end=entry_end,
            reason=reason,
            path_length=round(path_length, 2) if path_length is not None else None,
        )

    def _abandon_commitment(self, reason: str) -> None:
        wall = self.committed_wall_segment_id
        direction = self.committed_direction
        entry_end = self.committed_entry_end
        if wall is not None:
            self.trajectory_failure_counts[wall] = self.trajectory_failure_counts.get(wall, 0) + 1
        self.active_nav_goal = None
        self.current_state = "planning"
        self.intentional_cooldown_until = time.monotonic() + self.config.recovery_cooldown
        logger.info(
            "Abandon committed trajectory",
            wall=wall,
            direction=direction,
            entry_end=entry_end,
            reason=reason,
            plan_failures=self.committed_plan_failures,
            recovery_failures=self.committed_recovery_failures,
        )
        self._clear_commitment()

    def _committed_target_reachable(self) -> bool:
        if (
            not self.commitment_active
            or self.committed_end_target is None
            or self.latest_costmap is None
            or self.latest_odometry is None
        ):
            return False

        robot_pose = Vector3(
            self.latest_odometry.position.x, self.latest_odometry.position.y, 0.0
        )
        costmap = simple_inflate(self.latest_costmap, 0.25)
        path = min_cost_astar(
            costmap,
            goal=self.committed_end_target,
            start=robot_pose,
            cost_threshold=self.config.occupancy_threshold + 1,
        )
        return path is not None and bool(path)

    def _recover_committed_trajectory(self, reason: str) -> bool:
        if (
            not self.commitment_active
            or self.committed_end_target is None
            or self.latest_costmap is None
            or self.latest_odometry is None
        ):
            return False

        if self.active_nav_goal is not None:
            self._cancel_navigation_goal(reason)

        robot_pose = Vector3(
            self.latest_odometry.position.x, self.latest_odometry.position.y, 0.0
        )
        costmap = simple_inflate(self.latest_costmap, 0.25)
        path = min_cost_astar(
            costmap,
            goal=self.committed_end_target,
            start=robot_pose,
            cost_threshold=self.config.occupancy_threshold + 1,
        )

        if path is None or not path:
            self.committed_plan_failures += 1
            self.committed_recovery_failures += 1
            logger.info(
                "Target invalid",
                wall=self.committed_wall_segment_id,
                direction=self.committed_direction,
                entry_end=self.committed_entry_end,
                reason="no_path",
                plan_failures=self.committed_plan_failures,
                recovery_failures=self.committed_recovery_failures,
            )
            replacement = self._find_same_wall_replacement(robot_pose, costmap)
            if replacement is not None:
                return self._apply_same_wall_replacement(replacement, reason)

            logger.info(
                "Same-wall recovery failed",
                wall=self.committed_wall_segment_id,
                direction=self.committed_direction,
                switch_reason="local_continuation_blocked",
            )
            if (
                self.committed_plan_failures >= self.config.max_committed_plan_failures
                or self.committed_recovery_failures >= self.config.max_committed_recovery_failures
            ):
                self._abandon_commitment("local_continuation_blocked")
            return False

        self.committed_waypoints = self._build_committed_waypoints(path)
        self.committed_waypoint_index = 0
        self.committed_path_id += 1
        self.committed_path_length_m = self._compute_path_length(path)
        self.committed_last_goal_publish_time = None
        self.committed_plan_failures = 0
        self.committed_recovery_failures = 0
        self._reset_committed_target_invalidation()
        self.current_state = "recovering"
        logger.info(
            "Recover committed trajectory",
            wall=self.committed_wall_segment_id,
            direction=self.committed_direction,
            entry_end=self.committed_entry_end,
            reason=reason,
            path_length=round(self.committed_path_length_m, 2),
        )
        return self._publish_committed_waypoint("recover_same_trajectory")

    def _plan_next_goal(self, reason: str) -> bool:
        if self.latest_costmap is None or self.latest_odometry is None:
            return False

        robot_pose = Vector3(
            self.latest_odometry.position.x, self.latest_odometry.position.y, 0.0
        )
        costmap = simple_inflate(self.latest_costmap, 0.25)
        if self.commitment_active:
            return self._publish_committed_waypoint("continue_committed_trajectory")

        candidate = self._select_candidate_trajectory(robot_pose, costmap, reason)
        if candidate is None:
            self.active_nav_goal = None
            self.current_state = "idle"
            self.no_frontier_streak += 1
            self.intentional_cooldown_until = time.monotonic() + self.config.recovery_cooldown
            logger.info(
                "No exploration goal available",
                reason=reason,
                no_frontier_streak=self.no_frontier_streak,
                remaining_frontiers=self.remaining_frontiers,
                no_gain_counter=self.no_gain_counter,
                done_streak=self.done_streak,
            )
            return False

        logger.info(
            "Commit trajectory selection",
            wall=candidate.segment_id,
            dir=candidate.direction,
            entry_end=candidate.entry_end,
            path_length=round(candidate.path_length_m, 2),
            reason=reason,
        )
        return self._activate_commitment(candidate, reason)

    def _request_replan(self, action: str) -> None:
        if self.replan_requested.is_set():
            return

        self.recovery_state = action
        self.recovery_attempts += 1
        self.replan_requested.set()

    def _handle_replan_request(self) -> None:
        self.replan_requested.clear()

        if self.commitment_active:
            self.current_state = "recovering"
            logger.info(
                "Committed trajectory recovery requested",
                wall=self.committed_wall_segment_id,
                direction=self.committed_direction,
                entry_end=self.committed_entry_end,
                action=self.recovery_state,
                recovery_attempts=self.recovery_attempts,
            )
            recovered = self._recover_committed_trajectory(self.recovery_state)
            if not recovered:
                self.intentional_cooldown_until = time.monotonic() + self.config.recovery_cooldown
            return

        if self.active_nav_goal is not None:
            self._cancel_navigation_goal(self.recovery_state)

        self.active_nav_goal = None
        self.current_state = "recovering"
        self.intentional_cooldown_until = time.monotonic() + self.config.recovery_cooldown
        logger.info(
            "Exploration recovery requested",
            action=self.recovery_state,
            frontier_id=self.current_frontier_id,
            recovery_attempts=self.recovery_attempts,
        )

    def _handle_goal_reached(self) -> None:
        self.goal_reached_event.clear()
        self.active_nav_goal = None
        self.intentional_cooldown_until = 0.0
        self._record_progress("goal_reached", frontier_id=self.current_frontier_id)

        if self.commitment_active:
            self.committed_waypoint_index += 1
            if self.committed_waypoint_index < len(self.committed_waypoints):
                self.current_state = "planning"
                logger.info(
                    "Waypoint reached, continuing same trajectory",
                    wall=self.committed_wall_segment_id,
                    direction=self.committed_direction,
                    entry_end=self.committed_entry_end,
                    waypoint=f"{self.committed_waypoint_index + 1}/{len(self.committed_waypoints)}",
                )
                self._publish_committed_waypoint("continue_same_trajectory")
            else:
                self._complete_commitment("trajectory_complete")
            return

        self.current_state = "planning"
        logger.info(
            "Goal reached, continuing exploration",
            frontier_id=self.current_frontier_id,
            goals_published=self.goals_published,
        )

    def _stop_exploration_internal(self, reason: str) -> bool:
        if not self.exploration_active:
            return False

        wall = self.committed_wall_segment_id
        self.exploration_active = False
        self.stop_event.set()
        self.replan_requested.set()
        self.no_gain_counter = 0
        self.active_nav_goal = None
        self.current_state = "stopped"
        self.recovery_state = "none"
        self.intentional_cooldown_until = 0.0
        self._clear_commitment()

        if self.latest_odometry is not None:
            goal = PoseStamped(
                position=self.latest_odometry.position,
                orientation=self.latest_odometry.orientation,
                frame_id="world",
                ts=self.latest_odometry.ts,
            )
            self.goal_request.publish(goal)

        logger.info(
            "Stopped autonomous frontier exploration",
            reason=reason,
            goals_published=self.goals_published,
            done_streak=self.done_streak,
            remaining_frontiers=self.remaining_frontiers,
            frontier_id=self.current_frontier_id,
            wall=wall,
        )
        return True

    def _watchdog_tick(self) -> str:
        if not self.exploration_active:
            return "inactive"

        now = time.monotonic()
        in_cooldown = now < self.intentional_cooldown_until
        active_goal = self.active_nav_goal is not None
        nav_state = self._get_navigation_state()
        goal_age = self._seconds_since(
            self.committed_last_goal_publish_time
            if self.commitment_active
            else self.last_goal_publish_time
        )
        progress_age = self._seconds_since(
            self.committed_last_progress_time
            if self.commitment_active
            else self.last_progress_time
        ) or 0.0
        self.remaining_frontiers = self._estimate_remaining_frontiers()
        has_objective = active_goal or self.commitment_active
        target_invalid_age = 0.0
        target_invalid_count = 0
        committed_target_reachable: bool | None = None

        if self.commitment_active:
            committed_target_reachable = self._committed_target_reachable()
            if committed_target_reachable:
                self._reset_committed_target_invalidation()
            else:
                target_invalid_age, target_invalid_count = self._note_committed_target_invalidation(
                    "no_path"
                )

        if self.remaining_frontiers > 0 or has_objective:
            self.done_streak = 0
            self.done_confidence = False
        elif not in_cooldown:
            self.done_streak += 1
            self.done_confidence = self.done_streak >= self.config.done_confirmation_cycles
        else:
            self.done_streak = 0
            self.done_confidence = False

        action = "hold"
        if self.done_confidence and not has_objective:
            action = "stop_confirmed_done"
            self._stop_exploration_internal("confirmed_no_reachable_frontier")
        elif not in_cooldown:
            if self.commitment_active:
                if (
                    committed_target_reachable is False
                    and (
                        target_invalid_age >= self.config.target_invalidation_timeout
                        or target_invalid_count >= self.config.target_invalidation_failures
                    )
                ):
                    action = "target_invalid_no_path"
                    logger.info(
                        "Target invalid",
                        wall=self.committed_wall_segment_id,
                        direction=self.committed_direction,
                        reason="no_path",
                        seconds_invalid=round(target_invalid_age, 1),
                        invalid_count=target_invalid_count,
                    )
                    self._request_replan(action)
                elif (
                    self.committed_plan_failures >= self.config.target_invalidation_failures
                    and progress_age > self.config.shadowed_target_progress_timeout
                ):
                    action = "target_invalid_repeated_replan"
                    logger.info(
                        "Target invalid",
                        wall=self.committed_wall_segment_id,
                        direction=self.committed_direction,
                        reason="repeated_replan",
                        plan_failures=self.committed_plan_failures,
                        seconds_since_progress=round(progress_age, 1),
                    )
                    self._request_replan(action)
                elif not active_goal and (goal_age is None or goal_age > self.config.idle_goal_timeout):
                    action = (
                        "recover_invalid_path"
                        if committed_target_reachable is False
                        else "resume_committed_trajectory"
                    )
                    self._request_replan(action)
                elif nav_state == NavigationState.RECOVERY and progress_age > self.config.stuck_timeout:
                    action = "recover_persistent_blockage"
                    self._request_replan(action)
                elif nav_state == NavigationState.IDLE and progress_age > self.config.stuck_timeout:
                    action = "recover_idle_nav"
                    self._request_replan(action)
                elif (
                    nav_state == NavigationState.FOLLOWING_PATH
                    and progress_age > self.config.following_path_stuck_timeout
                ):
                    action = "recover_stuck_following"
                    self._request_replan(action)
            else:
                if not active_goal and (goal_age is None or goal_age > self.config.idle_goal_timeout):
                    action = "resume_no_goal"
                    self._request_replan(action)
                elif (
                    active_goal
                    and nav_state == NavigationState.IDLE
                    and goal_age is not None
                    and goal_age > self.config.idle_goal_timeout
                ):
                    action = "replan_idle_nav"
                    self._request_replan(action)
                elif active_goal and progress_age > self.config.stuck_timeout:
                    action = "replan_stalled"
                    self._request_replan(action)

        logger.info(
            "Exploration watchdog",
            state=self.current_state,
            nav_state=getattr(nav_state, "value", nav_state),
            frontier_id=self.current_frontier_id,
            wall=self.committed_wall_segment_id,
            direction=self.committed_direction,
            entry_end=self.committed_entry_end,
            commitment_active=self.commitment_active,
            active_goal=active_goal,
            target_reachable=committed_target_reachable,
            target_invalid_count=target_invalid_count,
            target_invalid_age=round(target_invalid_age, 1),
            seconds_since_goal=round(goal_age, 1) if goal_age is not None else None,
            seconds_since_progress=round(progress_age, 1),
            remaining_frontiers=self.remaining_frontiers,
            done_streak=self.done_streak,
            done_confidence=self.done_confidence,
            recovery_state=self.recovery_state,
            action=action,
        )
        return action

    def _watchdog_loop(self) -> None:
        while self.exploration_active and not self.stop_event.wait(self.config.watchdog_interval):
            self._watchdog_tick()

    def _count_costmap_information(self, costmap: OccupancyGrid) -> int:
        """
        Count the amount of information in a costmap (free space + obstacles).

        Args:
            costmap: Costmap to analyze

        Returns:
            Number of cells that are free space or obstacles (not unknown)
        """
        free_count = np.sum(costmap.grid == CostValues.FREE)
        obstacle_count = np.sum(costmap.grid >= self.config.occupancy_threshold)
        return int(free_count + obstacle_count)

    def _get_neighbors(self, point: GridPoint, costmap: OccupancyGrid) -> list[GridPoint]:
        """Get valid neighboring points for a given grid point."""
        neighbors = []

        # 8-connected neighbors
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                if dx == 0 and dy == 0:
                    continue

                nx, ny = point.x + dx, point.y + dy

                # Check bounds
                if 0 <= nx < costmap.width and 0 <= ny < costmap.height:
                    neighbors.append(self._cache.get_point(nx, ny))

        return neighbors

    def _is_frontier_point(self, point: GridPoint, costmap: OccupancyGrid) -> bool:
        """
        Check if a point is a frontier point.
        A frontier point is an unknown cell adjacent to at least one free cell
        and not adjacent to any occupied cells.
        """
        # Point must be unknown
        cost = costmap.grid[point.y, point.x]
        if cost != CostValues.UNKNOWN:
            return False

        has_free = False

        for neighbor in self._get_neighbors(point, costmap):
            neighbor_cost = costmap.grid[neighbor.y, neighbor.x]

            # If adjacent to occupied space, not a frontier
            if neighbor_cost > self.config.occupancy_threshold:
                return False

            # Check if adjacent to free space
            if neighbor_cost == CostValues.FREE:
                has_free = True

        return has_free

    def _find_free_space(
        self, start_x: int, start_y: int, costmap: OccupancyGrid
    ) -> tuple[int, int]:
        """
        Find the nearest free space point using BFS from the starting position.
        """
        queue = deque([self._cache.get_point(start_x, start_y)])
        visited = set()

        while queue:
            point = queue.popleft()

            if (point.x, point.y) in visited:
                continue
            visited.add((point.x, point.y))

            # Check if this point is free space
            if costmap.grid[point.y, point.x] == CostValues.FREE:
                return (point.x, point.y)

            # Add neighbors to search
            for neighbor in self._get_neighbors(point, costmap):
                if (neighbor.x, neighbor.y) not in visited:
                    queue.append(neighbor)

        # If no free space found, return original position
        return (start_x, start_y)

    def _compute_centroid(self, frontier_points: list[Vector3]) -> Vector3:
        """Compute the centroid of a list of frontier points."""
        if not frontier_points:
            return Vector3(0.0, 0.0, 0.0)

        # Vectorized approach using numpy
        points_array = np.array([[point.x, point.y] for point in frontier_points])
        centroid = np.mean(points_array, axis=0)

        return Vector3(centroid[0], centroid[1], 0.0)

    def detect_frontiers(self, robot_pose: Vector3, costmap: OccupancyGrid) -> list[Vector3]:
        """
        Main frontier detection algorithm using wavefront exploration.

        Args:
            robot_pose: Current robot position in world coordinates
            costmap: Costmap for frontier detection

        Returns:
            List of frontier centroids in world coordinates
        """
        self._cache.clear()

        # Convert robot pose to grid coordinates
        grid_pos = costmap.world_to_grid(robot_pose)
        grid_x, grid_y = int(grid_pos.x), int(grid_pos.y)

        # Find nearest free space to start exploration
        free_x, free_y = self._find_free_space(grid_x, grid_y, costmap)
        start_point = self._cache.get_point(free_x, free_y)
        start_point.classification = PointClassification.MapOpen

        # Main exploration queue - explore ALL reachable free space
        map_queue = deque([start_point])
        frontiers = []
        frontier_sizes = []

        points_checked = 0
        frontier_candidates = 0

        while map_queue:
            current_point = map_queue.popleft()
            points_checked += 1

            # Skip if already processed
            if current_point.classification & PointClassification.MapClosed:
                continue

            # Mark as processed
            current_point.classification |= PointClassification.MapClosed

            # Check if this point starts a new frontier
            if self._is_frontier_point(current_point, costmap):
                frontier_candidates += 1
                current_point.classification |= PointClassification.FrontierOpen
                frontier_queue = deque([current_point])
                new_frontier = []

                # Explore this frontier region using BFS
                while frontier_queue:
                    frontier_point = frontier_queue.popleft()

                    # Skip if already processed
                    if frontier_point.classification & PointClassification.FrontierClosed:
                        continue

                    # If this is still a frontier point, add to current frontier
                    if self._is_frontier_point(frontier_point, costmap):
                        new_frontier.append(frontier_point)

                        # Add neighbors to frontier queue
                        for neighbor in self._get_neighbors(frontier_point, costmap):
                            if not (
                                neighbor.classification
                                & (
                                    PointClassification.FrontierOpen
                                    | PointClassification.FrontierClosed
                                )
                            ):
                                neighbor.classification |= PointClassification.FrontierOpen
                                frontier_queue.append(neighbor)

                    frontier_point.classification |= PointClassification.FrontierClosed

                # Check if we found a large enough frontier
                # Convert minimum perimeter to minimum number of cells based on resolution
                min_cells = int(self.config.min_frontier_perimeter / costmap.resolution)
                if len(new_frontier) >= min_cells:
                    world_points = []
                    for point in new_frontier:
                        world_pos = costmap.grid_to_world(
                            Vector3(float(point.x), float(point.y), 0.0)
                        )
                        world_points.append(world_pos)

                    # Compute centroid in world coordinates (already correctly scaled)
                    centroid = self._compute_centroid(world_points)
                    frontiers.append(centroid)  # Store centroid
                    frontier_sizes.append(len(new_frontier))  # Store frontier size

            # Add ALL neighbors to main exploration queue to explore entire free space
            for neighbor in self._get_neighbors(current_point, costmap):
                if not (
                    neighbor.classification
                    & (PointClassification.MapOpen | PointClassification.MapClosed)
                ):
                    # Check if neighbor is free space or unknown (explorable)
                    neighbor_cost = costmap.grid[neighbor.y, neighbor.x]

                    # Add free space and unknown space to exploration queue
                    if neighbor_cost == CostValues.FREE or neighbor_cost == CostValues.UNKNOWN:
                        neighbor.classification |= PointClassification.MapOpen
                        map_queue.append(neighbor)

        # Extract just the centroids for ranking
        frontier_centroids = frontiers

        if not frontier_centroids:
            return []

        # Rank frontiers using original costmap for proper filtering
        ranked_frontiers = self._rank_frontiers(
            frontier_centroids, frontier_sizes, robot_pose, costmap
        )

        return ranked_frontiers

    def _update_exploration_direction(
        self, robot_pose: Vector3, goal_pose: Vector3 | None = None
    ) -> None:
        """Update the current exploration direction based on robot movement or selected goal."""
        if goal_pose is not None:
            # Calculate direction from robot to goal
            direction = Vector3(goal_pose.x - robot_pose.x, goal_pose.y - robot_pose.y, 0.0)
            magnitude = np.sqrt(direction.x**2 + direction.y**2)
            if magnitude > 0.1:  # Avoid division by zero for very close goals
                self.exploration_direction = Vector3(
                    direction.x / magnitude, direction.y / magnitude, 0.0
                )

    def _compute_direction_momentum_score(self, frontier: Vector3, robot_pose: Vector3) -> float:
        """Compute direction momentum score for a frontier."""
        if self.exploration_direction.x == 0 and self.exploration_direction.y == 0:
            return 0.0  # No momentum if no previous direction

        # Calculate direction from robot to frontier
        frontier_direction = Vector3(frontier.x - robot_pose.x, frontier.y - robot_pose.y, 0.0)
        magnitude = np.sqrt(frontier_direction.x**2 + frontier_direction.y**2)

        if magnitude < 0.1:
            return 0.0  # Too close to calculate meaningful direction

        # Normalize frontier direction
        frontier_direction = Vector3(
            frontier_direction.x / magnitude, frontier_direction.y / magnitude, 0.0
        )

        # Calculate dot product for directional alignment
        dot_product = (
            self.exploration_direction.x * frontier_direction.x
            + self.exploration_direction.y * frontier_direction.y
        )

        # Return momentum score (higher for same direction, lower for opposite)
        return max(0.0, dot_product)  # Only positive momentum, no penalty for different directions

    def _compute_distance_to_explored_goals(self, frontier: Vector3) -> float:
        """Compute distance from frontier to the nearest explored goal."""
        if not self.explored_goals:
            return 5.0  # Default consistent value when no explored goals
        # Calculate distance to nearest explored goal
        min_distance = float("inf")
        for goal in self.explored_goals:
            distance = np.sqrt((frontier.x - goal.x) ** 2 + (frontier.y - goal.y) ** 2)
            min_distance = min(min_distance, distance)

        return min_distance

    def _compute_distance_to_obstacles(self, frontier: Vector3, costmap: OccupancyGrid) -> float:
        """
        Compute the minimum distance from a frontier point to the nearest obstacle.

        Args:
            frontier: Frontier point in world coordinates
            costmap: Costmap to check for obstacles

        Returns:
            Minimum distance to nearest obstacle in meters
        """
        # Convert frontier to grid coordinates
        grid_pos = costmap.world_to_grid(frontier)
        grid_x, grid_y = int(grid_pos.x), int(grid_pos.y)

        # Check if frontier is within costmap bounds
        if grid_x < 0 or grid_x >= costmap.width or grid_y < 0 or grid_y >= costmap.height:
            return 0.0  # Consider out-of-bounds as obstacle

        min_distance = float("inf")
        search_radius = (
            int(self.config.safe_distance / costmap.resolution) + 5
        )  # Search a bit beyond minimum

        # Search in a square around the frontier point
        for dy in range(-search_radius, search_radius + 1):
            for dx in range(-search_radius, search_radius + 1):
                check_x = grid_x + dx
                check_y = grid_y + dy

                # Skip if out of bounds
                if (
                    check_x < 0
                    or check_x >= costmap.width
                    or check_y < 0
                    or check_y >= costmap.height
                ):
                    continue

                # Check if this cell is an obstacle
                if costmap.grid[check_y, check_x] >= self.config.occupancy_threshold:
                    # Calculate distance in meters
                    distance = np.sqrt(dx**2 + dy**2) * costmap.resolution
                    min_distance = min(min_distance, distance)

        # If no obstacles found within search radius, return the safe distance
        # This indicates the frontier is safely away from obstacles
        return min_distance if min_distance != float("inf") else self.config.safe_distance

    def _compute_comprehensive_frontier_score(
        self, frontier: Vector3, frontier_size: int, robot_pose: Vector3, costmap: OccupancyGrid
    ) -> float:
        """Compute comprehensive score considering multiple criteria."""

        # 1. Distance from robot (preference for moderate distances)
        robot_distance = get_distance(frontier, robot_pose)

        # Distance score: prefer moderate distances (not too close, not too far)
        # Normalized to 0-1 range
        distance_score = 1.0 / (1.0 + abs(robot_distance - self.config.lookahead_distance))

        # 2. Information gain (frontier size)
        # Normalize by a reasonable max frontier size
        max_expected_frontier_size = self.config.min_frontier_perimeter / costmap.resolution * 10
        info_gain_score = min(frontier_size / max_expected_frontier_size, 1.0)

        # 3. Distance to explored goals (bonus for being far from explored areas)
        # Normalize by a reasonable max distance (e.g., 10 meters)
        explored_goals_distance = self._compute_distance_to_explored_goals(frontier)
        explored_goals_score = min(explored_goals_distance / self.config.max_explored_distance, 1.0)

        # 4. Distance to obstacles (score based on safety)
        # 0 = too close to obstacles, 1 = at or beyond safe distance
        obstacles_distance = self._compute_distance_to_obstacles(frontier, costmap)
        if obstacles_distance >= self.config.safe_distance:
            obstacles_score = 1.0  # Fully safe
        else:
            obstacles_score = obstacles_distance / self.config.safe_distance  # Linear penalty

        # 5. Direction momentum (already in 0-1 range from dot product)
        momentum_score = self._compute_direction_momentum_score(frontier, robot_pose)

        logger.info(
            f"Distance score: {distance_score:.2f}, Info gain: {info_gain_score:.2f}, Explored goals: {explored_goals_score:.2f}, Obstacles: {obstacles_score:.2f}, Momentum: {momentum_score:.2f}"
        )

        # Combine scores with consistent scaling
        total_score = (
            0.3 * info_gain_score  # 30% information gain
            + 0.3 * explored_goals_score  # 30% distance from explored goals
            + 0.2 * distance_score  # 20% distance optimization
            + 0.15 * obstacles_score  # 15% distance from obstacles
            + 0.05 * momentum_score  # 5% direction momentum
        )

        return total_score

    def _rank_frontiers(
        self,
        frontier_centroids: list[Vector3],
        frontier_sizes: list[int],
        robot_pose: Vector3,
        costmap: OccupancyGrid,
    ) -> list[Vector3]:
        """
        Find the single best frontier using comprehensive scoring and filtering.

        Args:
            frontier_centroids: List of frontier centroids
            frontier_sizes: List of frontier sizes
            robot_pose: Current robot position
            costmap: Costmap for additional analysis

        Returns:
            List containing single best frontier, or empty list if none suitable
        """
        if not frontier_centroids:
            return []

        valid_frontiers = []

        for i, frontier in enumerate(frontier_centroids):
            # Compute comprehensive score
            frontier_size = frontier_sizes[i] if i < len(frontier_sizes) else 1
            score = self._compute_comprehensive_frontier_score(
                frontier, frontier_size, robot_pose, costmap
            )

            valid_frontiers.append((frontier, score))

        logger.info(f"Valid frontiers: {len(valid_frontiers)}")

        if not valid_frontiers:
            return []

        # Sort by score and return all valid frontiers (highest scores first)
        valid_frontiers.sort(key=lambda x: x[1], reverse=True)

        # Extract just the frontiers (remove scores) and return as list
        return [frontier for frontier, _ in valid_frontiers]

    def get_exploration_goal(self, robot_pose: Vector3, costmap: OccupancyGrid) -> Vector3 | None:
        """
        Get the single best exploration goal using comprehensive frontier scoring.

        Args:
            robot_pose: Current robot position in world coordinates
            costmap: Costmap for additional analysis

        Returns:
            Single best frontier goal in world coordinates, or None if no suitable frontiers found
        """
        if len(self.explored_goals) > 5 and self.last_costmap is not None:
            current_info = self._count_costmap_information(costmap)
            last_info = self._count_costmap_information(self.last_costmap)

            if last_info > 0:
                info_increase_percent = (current_info - last_info) / last_info
                if info_increase_percent < self.config.info_gain_threshold:
                    self.no_gain_counter += 1
                    logger.info(
                        "Low exploration information gain",
                        increase=round(info_increase_percent, 3),
                        threshold=self.config.info_gain_threshold,
                        current_info=current_info,
                        last_info=last_info,
                        no_gain_counter=self.no_gain_counter,
                    )
                else:
                    self.no_gain_counter = 0

        candidate = self._select_candidate_trajectory(robot_pose, costmap, "direct_goal_selection")
        if candidate is None:
            return None

        self._update_exploration_direction(robot_pose, candidate.goal)
        self.mark_explored_goal(candidate.goal)
        logger.info(
            "Selected exploration goal",
            wall=candidate.segment_id,
            direction=candidate.direction,
            entry_end=candidate.entry_end,
            path_length=round(candidate.path_length_m, 2),
        )
        return candidate.goal

    def mark_explored_goal(self, goal: Vector3) -> None:
        """Mark a goal as explored."""
        self.explored_goals.append(goal)

    def reset_exploration_session(self) -> None:
        """
        Reset all exploration state variables for a new exploration session.

        Call this method when starting a new exploration or when the robot
        needs to forget its previous exploration history.
        """
        self.explored_goals.clear()  # Clear all previously explored goals
        self.exploration_direction = Vector3(0.0, 0.0, 0.0)  # Reset exploration direction
        self.last_costmap = None  # Clear last costmap comparison
        self.no_gain_counter = 0  # Reset no-gain attempt counter
        self._cache.clear()  # Clear frontier point cache
        self.trajectory_failure_counts.clear()
        self._clear_commitment()

        logger.info("Exploration session reset - all state variables cleared")

    @rpc
    def explore(self) -> bool:
        """
        Start autonomous frontier exploration.

        Returns:
            bool: True if exploration started, False if already exploring
        """
        if self.exploration_active:
            logger.warning("Exploration already active")
            return False

        self.exploration_active = True
        self.stop_event.clear()
        self.replan_requested.clear()
        self.goal_reached_event.clear()
        self.current_state = "planning"
        self.active_nav_goal = None
        self.current_frontier_goal = None
        self.current_frontier_id = None
        self.last_goal_publish_time = None
        self.last_progress_time = time.monotonic()
        self.last_progress_pose = (
            Vector3(
                self.latest_odometry.position.x,
                self.latest_odometry.position.y,
                self.latest_odometry.position.z,
            )
            if self.latest_odometry is not None
            else None
        )
        self.last_progress_info_count = (
            self._count_costmap_information(self.latest_costmap)
            if self.latest_costmap is not None
            else None
        )
        self.remaining_frontiers = 0
        self.done_streak = 0
        self.done_confidence = False
        self.recovery_state = "none"
        self.recovery_attempts = 0
        self.intentional_cooldown_until = 0.0
        self.goals_published = 0
        self.no_frontier_streak = 0
        self._clear_commitment()

        self.exploration_thread = threading.Thread(target=self._exploration_loop, daemon=True)
        self.exploration_thread.start()
        self.watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self.watchdog_thread.start()

        logger.info("Started autonomous frontier exploration")
        return True

    @rpc
    def stop_exploration(self) -> bool:
        """
        Stop autonomous frontier exploration.

        Returns:
            bool: True if exploration was stopped, False if not exploring
        """
        stopped = self._stop_exploration_internal("requested")
        if not stopped:
            return False

        if (
            self.exploration_thread
            and self.exploration_thread.is_alive()
            and threading.current_thread() != self.exploration_thread
        ):
            self.exploration_thread.join(timeout=2.0)

        if (
            self.watchdog_thread
            and self.watchdog_thread.is_alive()
            and threading.current_thread() != self.watchdog_thread
        ):
            self.watchdog_thread.join(timeout=2.0)

        return True

    @rpc
    def is_exploration_active(self) -> bool:
        return self.exploration_active

    def _exploration_loop(self) -> None:
        """Main exploration loop running in a separate thread."""
        while self.exploration_active and not self.stop_event.is_set():
            if self.latest_costmap is None or self.latest_odometry is None:
                self.current_state = "waiting_for_data"
                self.stop_event.wait(0.5)
                continue

            if self.goal_reached_event.is_set():
                self._handle_goal_reached()
                continue

            if self.replan_requested.is_set():
                self._handle_replan_request()
                continue

            now = time.monotonic()
            if self.active_nav_goal is None:
                if now < self.intentional_cooldown_until:
                    self.current_state = "cooldown"
                    self.stop_event.wait(0.25)
                    continue

                self.current_state = "planning"
                self._plan_next_goal("loop")
                self.stop_event.wait(0.25)
                continue

            self.current_state = "navigating"
            self.stop_event.wait(0.25)

    @skill
    def begin_exploration(self) -> str:
        """Command the robot to move around and explore the area. Cancelled with end_exploration."""
        started = self.explore()
        if not started:
            return "Exploration skill is already active. Use end_exploration to stop before starting again."
        return (
            "Started exploration skill. The robot is now moving. Use end_exploration "
            "to stop. You also need to cancel before starting a new movement tool."
        )

    @skill
    def end_exploration(self) -> str:
        """Cancel the exploration. The robot will stop moving and remain where it is."""
        stopped = self.stop_exploration()
        if stopped:
            return "Stopped exploration. The robot has stopped moving."
        else:
            return "Exploration skill was not active, so nothing was stopped."
