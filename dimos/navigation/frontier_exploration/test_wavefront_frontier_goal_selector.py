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

import time

import numpy as np
import pytest

import dimos.navigation.frontier_exploration.wavefront_frontier_goal_selector as wavefront_module
from dimos.msgs.geometry_msgs.PoseStamped import PoseStamped
from dimos.msgs.geometry_msgs.Vector3 import Vector3
from dimos.msgs.nav_msgs.OccupancyGrid import CostValues, OccupancyGrid
from dimos.msgs.nav_msgs.Path import Path
from dimos.navigation.base import NavigationState
from dimos.navigation.frontier_exploration.wavefront_frontier_goal_selector import (
    CandidateTrajectory,
    WavefrontFrontierExplorer,
)


@pytest.fixture
def explorer():
    """Create a WavefrontFrontierExplorer instance for testing."""
    explorer = WavefrontFrontierExplorer(
        min_frontier_perimeter=0.3,  # Smaller for faster tests
        safe_distance=0.5,  # Smaller for faster distance calculations
        info_gain_threshold=0.02,
    )
    yield explorer
    # Cleanup after test
    try:
        explorer.stop()
    except:
        pass


@pytest.fixture
def quick_costmap():
    """Create a very small costmap for quick tests."""
    width, height = 20, 20
    grid = np.full((height, width), CostValues.UNKNOWN, dtype=np.int8)

    # Simple free space in center
    grid[8:12, 8:12] = CostValues.FREE

    # Small extensions
    grid[9:11, 6:8] = CostValues.FREE  # Left
    grid[9:11, 12:14] = CostValues.FREE  # Right

    # One obstacle
    grid[9:10, 9:10] = CostValues.OCCUPIED

    from dimos.msgs.geometry_msgs.Pose import Pose

    origin = Pose()
    origin.position.x = -1.0
    origin.position.y = -1.0
    origin.position.z = 0.0
    origin.orientation.w = 1.0

    occupancy_grid = OccupancyGrid(
        grid=grid, resolution=0.1, origin=origin, frame_id="map", ts=time.time()
    )

    class MockLidar:
        def __init__(self) -> None:
            self.origin = Vector3(0.0, 0.0, 0.0)

    return occupancy_grid, MockLidar()


def create_test_costmap(width: int = 40, height: int = 40, resolution: float = 0.1):
    """Create a simple test costmap with free, occupied, and unknown regions.

    Default size reduced from 100x100 to 40x40 for faster tests.
    """
    grid = np.full((height, width), CostValues.UNKNOWN, dtype=np.int8)

    # Create a smaller free space region with simple shape
    # Central room
    grid[15:25, 15:25] = CostValues.FREE

    # Small corridors extending from central room
    grid[18:22, 10:15] = CostValues.FREE  # Left corridor
    grid[18:22, 25:30] = CostValues.FREE  # Right corridor
    grid[10:15, 18:22] = CostValues.FREE  # Top corridor
    grid[25:30, 18:22] = CostValues.FREE  # Bottom corridor

    # Add fewer obstacles for faster processing
    grid[19:21, 19:21] = CostValues.OCCUPIED  # Central obstacle
    grid[13:14, 18:22] = CostValues.OCCUPIED  # Top corridor obstacle

    # Create origin at bottom-left, adjusted for map size
    from dimos.msgs.geometry_msgs.Pose import Pose

    origin = Pose()
    # Center the map around (0, 0) in world coordinates
    origin.position.x = -(width * resolution) / 2.0
    origin.position.y = -(height * resolution) / 2.0
    origin.position.z = 0.0
    origin.orientation.w = 1.0

    occupancy_grid = OccupancyGrid(
        grid=grid, resolution=resolution, origin=origin, frame_id="map", ts=time.time()
    )

    # Create a mock lidar message with origin
    class MockLidar:
        def __init__(self) -> None:
            self.origin = Vector3(0.0, 0.0, 0.0)

    return occupancy_grid, MockLidar()


def make_pose(x: float, y: float) -> PoseStamped:
    return PoseStamped(
        position=[x, y, 0.0],
        orientation=[0.0, 0.0, 0.0, 1.0],
        frame_id="world",
        ts=time.time(),
    )


def make_candidate(
    goal: Vector3,
    path_length_m: float,
    segment_id: str,
    *,
    direction: int = 1,
    entry_end: str = "A",
    frontier_rank: int = 0,
    continuity_score: float = 0.0,
    failure_count: int = 0,
) -> CandidateTrajectory:
    return CandidateTrajectory(
        goal=goal,
        path=Path(poses=[make_pose(0.0, 0.0), make_pose(path_length_m, 0.0)]),
        path_length_m=path_length_m,
        segment_id=segment_id,
        direction=direction,
        entry_end=entry_end,
        label=entry_end,
        frontier_rank=frontier_rank,
        continuity_score=continuity_score,
        failure_count=failure_count,
    )


def install_fake_publish(explorer: WavefrontFrontierExplorer):
    published = []

    def fake_publish(goal, action, *, frontier_goal=None, frontier_id=None):  # type: ignore[no-untyped-def]
        goal_msg = explorer._make_goal_msg(goal)
        explorer.active_nav_goal = goal_msg
        explorer.current_frontier_goal = frontier_goal or Vector3(goal_msg.x, goal_msg.y, goal_msg.z)
        explorer.current_frontier_id = frontier_id or explorer._goal_id(explorer.current_frontier_goal)
        now = time.monotonic()
        explorer.last_goal_publish_time = now
        if explorer.commitment_active:
            explorer.committed_last_goal_publish_time = now
        explorer.current_state = "navigating"
        published.append((action, explorer.current_frontier_id, goal_msg.x, goal_msg.y))

    explorer._publish_navigation_goal = fake_publish  # type: ignore[method-assign]
    return published


def test_frontier_detection_with_office_lidar(explorer, quick_costmap) -> None:
    """Test frontier detection using a test costmap."""
    # Get test costmap
    costmap, first_lidar = quick_costmap

    # Verify we have a valid costmap
    assert costmap is not None, "Costmap should not be None"
    assert costmap.width > 0 and costmap.height > 0, "Costmap should have valid dimensions"

    print(f"Costmap dimensions: {costmap.width}x{costmap.height}")
    print(f"Costmap resolution: {costmap.resolution}")
    print(f"Unknown percent: {costmap.unknown_percent:.1f}%")
    print(f"Free percent: {costmap.free_percent:.1f}%")
    print(f"Occupied percent: {costmap.occupied_percent:.1f}%")

    # Set robot pose near the center of free space in the costmap
    # We'll use the lidar origin as a reasonable robot position
    robot_pose = first_lidar.origin
    print(f"Robot pose: {robot_pose}")

    # Detect frontiers
    frontiers = explorer.detect_frontiers(robot_pose, costmap)

    # Verify frontier detection results
    assert isinstance(frontiers, list), "Frontiers should be returned as a list"
    print(f"Detected {len(frontiers)} frontiers")

    # Test that we get some frontiers (office environment should have unexplored areas)
    if len(frontiers) > 0:
        print("Frontier detection successful - found unexplored areas")

        # Verify frontiers are Vector objects with valid coordinates
        for i, frontier in enumerate(frontiers[:5]):  # Check first 5
            assert isinstance(frontier, Vector3), f"Frontier {i} should be a Vector3"
            assert hasattr(frontier, "x") and hasattr(frontier, "y"), (
                f"Frontier {i} should have x,y coordinates"
            )
            print(f"  Frontier {i}: ({frontier.x:.2f}, {frontier.y:.2f})")
    else:
        print("No frontiers detected - map may be fully explored or parameters too restrictive")

    explorer.stop()  # TODO: this should be a in try-finally


def test_exploration_goal_selection(explorer) -> None:
    """Test the complete exploration goal selection pipeline."""
    # Get test costmap - use regular size for more realistic test
    costmap, first_lidar = create_test_costmap()

    # Use lidar origin as robot position
    robot_pose = first_lidar.origin

    # Get exploration goal
    goal = explorer.get_exploration_goal(robot_pose, costmap)

    if goal is not None:
        assert isinstance(goal, Vector3), "Goal should be a Vector3"
        print(f"Selected exploration goal: ({goal.x:.2f}, {goal.y:.2f})")

        # Test that goal gets marked as explored
        assert len(explorer.explored_goals) == 1, "Goal should be marked as explored"
        assert explorer.explored_goals[0] == goal, "Explored goal should match selected goal"

        # Test that goal is within costmap bounds
        grid_pos = costmap.world_to_grid(goal)
        assert 0 <= grid_pos.x < costmap.width, "Goal x should be within costmap bounds"
        assert 0 <= grid_pos.y < costmap.height, "Goal y should be within costmap bounds"

        # Test that goal is at a reasonable distance from robot
        distance = np.sqrt((goal.x - robot_pose.x) ** 2 + (goal.y - robot_pose.y) ** 2)
        assert 0.1 < distance < 20.0, f"Goal distance {distance:.2f}m should be reasonable"

    else:
        print("No exploration goal selected - map may be fully explored")

    explorer.stop()  # TODO: this should be a in try-finally


def test_exploration_session_reset(explorer) -> None:
    """Test exploration session reset functionality."""
    # Get test costmap
    costmap, first_lidar = create_test_costmap()

    # Use lidar origin as robot position
    robot_pose = first_lidar.origin

    # Select a goal to populate exploration state
    goal = explorer.get_exploration_goal(robot_pose, costmap)

    # Verify state is populated (skip if no goals available)
    if goal:
        initial_explored_count = len(explorer.explored_goals)
        assert initial_explored_count > 0, "Should have at least one explored goal"

    # Reset exploration session
    explorer.reset_exploration_session()

    # Verify state is cleared
    assert len(explorer.explored_goals) == 0, "Explored goals should be cleared after reset"
    assert explorer.exploration_direction.x == 0.0 and explorer.exploration_direction.y == 0.0, (
        "Exploration direction should be reset"
    )
    assert explorer.last_costmap is None, "Last costmap should be cleared"
    assert explorer.no_gain_counter == 0, "No-gain counter should be reset"

    print("Exploration session reset successfully")
    explorer.stop()  # TODO: this should be a in try-finally


def test_frontier_ranking(explorer) -> None:
    """Test that direct goal selection still returns a reachable frontier."""
    # Get test costmap
    costmap, first_lidar = create_test_costmap()

    robot_pose = first_lidar.origin

    candidates = explorer._build_candidate_trajectories(robot_pose, costmap)
    goal1 = explorer.get_exploration_goal(robot_pose, costmap)

    if goal1:
        assert candidates, "At least one reachable frontier candidate should exist"
        candidate_ids = {candidate.segment_id for candidate in candidates}
        assert explorer._goal_id(goal1) in candidate_ids, (
            "Selected goal should correspond to one of the reachable evaluated trajectories"
        )

        # Test that goals are being marked as explored
        assert len(explorer.explored_goals) == 1, "Goal should be marked as explored"
        assert (
            explorer.explored_goals[0].x == goal1.x and explorer.explored_goals[0].y == goal1.y
        ), "Explored goal should match selected goal"

        # Get another goal
        goal2 = explorer.get_exploration_goal(robot_pose, costmap)
        if goal2:
            assert len(explorer.explored_goals) == 2, (
                "Second goal should also be marked as explored"
            )

        # Test distance to obstacles
        obstacle_dist = explorer._compute_distance_to_obstacles(goal1, costmap)
        # Note: Goals might be closer than safe_distance if that's the best available frontier
        # The safe_distance is used for scoring, not as a hard constraint
        print(
            f"Distance to obstacles: {obstacle_dist:.2f}m (safe distance: {explorer.config.safe_distance}m)"
        )

        print(f"Frontier ranking test passed - selected goal at ({goal1.x:.2f}, {goal1.y:.2f})")
        print(f"Total reachable candidates detected: {len(candidates)}")
    else:
        print("No frontiers found for ranking test")

    explorer.stop()  # TODO: this should be a in try-finally


def test_exploration_with_no_gain_detection() -> None:
    """Low information gain should not terminate exploration on its own."""
    # Get initial costmap
    costmap1, first_lidar = create_test_costmap()

    # Initialize explorer with low no-gain threshold for testing
    explorer = WavefrontFrontierExplorer(info_gain_threshold=0.01, num_no_gain_attempts=2)

    try:
        robot_pose = first_lidar.origin

        # Select multiple goals to populate history
        for i in range(6):
            goal = explorer.get_exploration_goal(robot_pose, costmap1)
            if goal:
                print(f"Goal {i + 1}: ({goal.x:.2f}, {goal.y:.2f})")

        # Now use same costmap repeatedly to trigger no-gain detection
        initial_counter = explorer.no_gain_counter

        # This should increment no-gain counter without stopping exploration.
        goal = explorer.get_exploration_goal(robot_pose, costmap1)
        assert explorer.no_gain_counter > initial_counter, "No-gain counter should increment"
        assert goal is not None, "Low information gain should not force a stop"

        goal = explorer.get_exploration_goal(robot_pose, costmap1)
        assert goal is not None, "Explorer should keep producing goals while frontiers remain"
        assert explorer.no_gain_counter >= 1, "Low-gain streak should remain observable"
    finally:
        explorer.stop()


def test_watchdog_requests_replan_when_idle_without_goal() -> None:
    """The watchdog should recover from an idle no-goal state automatically."""
    explorer = WavefrontFrontierExplorer()

    try:
        explorer.exploration_active = True
        explorer.current_state = "idle"
        explorer.last_goal_publish_time = time.monotonic() - 5.0
        explorer.last_progress_time = time.monotonic()
        explorer.intentional_cooldown_until = 0.0

        explorer._estimate_remaining_frontiers = lambda: 2  # type: ignore[method-assign]
        explorer._get_navigation_state = lambda: None  # type: ignore[method-assign]

        action = explorer._watchdog_tick()

        assert action == "resume_no_goal"
        assert explorer.replan_requested.is_set()
        assert explorer.exploration_active
    finally:
        explorer.stop()


def test_watchdog_requires_multiple_empty_cycles_before_stopping() -> None:
    """A single empty planning cycle should not be treated as mission complete."""
    explorer = WavefrontFrontierExplorer(done_confirmation_cycles=3)

    try:
        explorer.exploration_active = True
        explorer.current_state = "idle"
        explorer.last_goal_publish_time = time.monotonic() - 5.0
        explorer.last_progress_time = time.monotonic() - 5.0
        explorer.intentional_cooldown_until = 0.0

        explorer._estimate_remaining_frontiers = lambda: 0  # type: ignore[method-assign]
        explorer._get_navigation_state = lambda: None  # type: ignore[method-assign]

        action = explorer._watchdog_tick()
        assert action == "resume_no_goal"
        assert explorer.exploration_active
        assert explorer.done_streak == 1

        explorer.replan_requested.clear()
        action = explorer._watchdog_tick()
        assert action == "resume_no_goal"
        assert explorer.exploration_active
        assert explorer.done_streak == 2

        explorer.replan_requested.clear()
        action = explorer._watchdog_tick()
        assert action == "stop_confirmed_done"
        assert not explorer.exploration_active
        assert explorer.done_confidence
    finally:
        explorer.stop()


def test_select_candidate_prefers_shorter_astar_path(quick_costmap) -> None:
    explorer = WavefrontFrontierExplorer(candidate_tie_margin=0.1)
    costmap, _ = quick_costmap

    try:
        robot_pose = Vector3(0.0, 0.0, 0.0)
        candidates = [
            make_candidate(Vector3(3.0, 0.0, 0.0), 5.8, "wall_a", entry_end="A", frontier_rank=0),
            make_candidate(Vector3(1.0, 0.0, 0.0), 2.4, "wall_b", entry_end="B", frontier_rank=1),
        ]
        explorer._build_candidate_trajectories = (  # type: ignore[method-assign]
            lambda *_args, **_kwargs: candidates
        )

        selected = explorer._select_candidate_trajectory(robot_pose, costmap, "test")

        assert selected is not None
        assert selected.segment_id == "wall_b"
        assert selected.entry_end == "B"
    finally:
        explorer.stop()


def test_committed_trajectory_publishes_final_endpoint_goal() -> None:
    explorer = WavefrontFrontierExplorer()

    try:
        explorer.latest_odometry = make_pose(0.0, 0.0)
        published = install_fake_publish(explorer)
        candidate = CandidateTrajectory(
            goal=Vector3(3.0, 0.0, 0.0),
            path=Path(poses=[make_pose(0.0, 0.0), make_pose(1.0, 0.0), make_pose(2.0, 0.0), make_pose(3.0, 0.0)]),
            path_length_m=3.0,
            segment_id="wall_12",
            direction=1,
            entry_end="A",
            label="A",
            frontier_rank=0,
            continuity_score=1.0,
            failure_count=0,
        )

        assert explorer._activate_commitment(candidate, "test")
        assert explorer.commitment_active
        assert explorer.current_frontier_id == "wall_12"
        assert len(published) == 1
        assert published[0][2:] == (3.0, 0.0)
        assert len(explorer.committed_waypoints) == 1

        explorer._handle_goal_reached()

        assert not explorer.commitment_active
        assert explorer.current_state == "planning"
        assert len(published) == 1
    finally:
        explorer.stop()


def test_watchdog_holds_committed_trajectory_while_progressing() -> None:
    explorer = WavefrontFrontierExplorer()

    try:
        explorer.exploration_active = True
        explorer.commitment_active = True
        explorer.committed_wall_segment_id = "wall_12"
        explorer.committed_direction = 1
        explorer.committed_entry_end = "A"
        explorer.committed_end_target = Vector3(2.0, 0.0, 0.0)
        explorer.active_nav_goal = make_pose(1.0, 0.0)
        explorer.current_state = "navigating"
        explorer.committed_last_goal_publish_time = time.monotonic() - 1.0
        explorer.committed_last_progress_time = time.monotonic() - 1.0
        explorer.intentional_cooldown_until = 0.0

        explorer._estimate_remaining_frontiers = lambda: 2  # type: ignore[method-assign]
        explorer._get_navigation_state = lambda: NavigationState.FOLLOWING_PATH  # type: ignore[method-assign]
        explorer._committed_target_reachable = lambda: True  # type: ignore[method-assign]

        action = explorer._watchdog_tick()

        assert action == "hold"
        assert not explorer.replan_requested.is_set()
    finally:
        explorer.stop()


def test_watchdog_holds_committed_goal_while_following_path() -> None:
    explorer = WavefrontFrontierExplorer(stuck_timeout=12.0, following_path_stuck_timeout=28.0)

    try:
        explorer.exploration_active = True
        explorer.commitment_active = True
        explorer.committed_wall_segment_id = "wall_12"
        explorer.committed_direction = 1
        explorer.committed_entry_end = "A"
        explorer.committed_end_target = Vector3(2.0, 0.0, 0.0)
        explorer.active_nav_goal = make_pose(1.0, 0.0)
        explorer.current_state = "navigating"
        explorer.committed_last_goal_publish_time = time.monotonic() - 5.0
        explorer.committed_last_progress_time = time.monotonic() - 13.0
        explorer.intentional_cooldown_until = 0.0

        explorer._estimate_remaining_frontiers = lambda: 2  # type: ignore[method-assign]
        explorer._get_navigation_state = lambda: NavigationState.FOLLOWING_PATH  # type: ignore[method-assign]
        explorer._committed_target_reachable = lambda: True  # type: ignore[method-assign]

        action = explorer._watchdog_tick()

        assert action == "hold"
        assert not explorer.replan_requested.is_set()
    finally:
        explorer.stop()


def test_watchdog_requests_recovery_when_committed_goal_goes_idle() -> None:
    explorer = WavefrontFrontierExplorer(stuck_timeout=12.0)

    try:
        explorer.exploration_active = True
        explorer.commitment_active = True
        explorer.committed_wall_segment_id = "wall_12"
        explorer.committed_direction = 1
        explorer.committed_entry_end = "A"
        explorer.committed_end_target = Vector3(2.0, 0.0, 0.0)
        explorer.active_nav_goal = make_pose(1.0, 0.0)
        explorer.current_state = "navigating"
        explorer.committed_last_goal_publish_time = time.monotonic() - 5.0
        explorer.committed_last_progress_time = time.monotonic() - 13.0
        explorer.intentional_cooldown_until = 0.0

        explorer._estimate_remaining_frontiers = lambda: 2  # type: ignore[method-assign]
        explorer._get_navigation_state = lambda: NavigationState.IDLE  # type: ignore[method-assign]
        explorer._committed_target_reachable = lambda: True  # type: ignore[method-assign]

        action = explorer._watchdog_tick()

        assert action == "recover_idle_nav"
        assert explorer.replan_requested.is_set()
    finally:
        explorer.stop()


def test_watchdog_invalidates_shadowed_target_after_no_path_timeout() -> None:
    explorer = WavefrontFrontierExplorer(target_invalidation_timeout=0.0, target_invalidation_failures=1)

    try:
        explorer.exploration_active = True
        explorer.commitment_active = True
        explorer.committed_wall_segment_id = "wall_12"
        explorer.committed_direction = 1
        explorer.committed_entry_end = "A"
        explorer.committed_end_target = Vector3(2.0, 0.0, 0.0)
        explorer.active_nav_goal = make_pose(2.0, 0.0)
        explorer.current_state = "navigating"
        explorer.committed_last_goal_publish_time = time.monotonic() - 5.0
        explorer.committed_last_progress_time = time.monotonic() - 1.0
        explorer.intentional_cooldown_until = 0.0

        explorer._estimate_remaining_frontiers = lambda: 2  # type: ignore[method-assign]
        explorer._get_navigation_state = lambda: NavigationState.FOLLOWING_PATH  # type: ignore[method-assign]
        explorer._committed_target_reachable = lambda: False  # type: ignore[method-assign]

        action = explorer._watchdog_tick()

        assert action == "target_invalid_no_path"
        assert explorer.replan_requested.is_set()
    finally:
        explorer.stop()


def test_recover_same_wall_replaces_unreachable_target(quick_costmap, monkeypatch) -> None:
    explorer = WavefrontFrontierExplorer()
    costmap, _ = quick_costmap

    try:
        explorer.latest_costmap = costmap
        explorer.latest_odometry = make_pose(0.0, 0.0)
        explorer.commitment_active = True
        explorer.committed_wall_segment_id = "wall_12"
        explorer.committed_direction = 1
        explorer.committed_entry_end = "A"
        explorer.committed_end_target = Vector3(2.0, 0.0, 0.0)
        explorer.committed_waypoints = [make_pose(2.0, 0.0)]
        published = install_fake_publish(explorer)

        replacement = make_candidate(
            Vector3(1.2, 0.4, 0.0),
            1.3,
            "wall_12",
            direction=1,
            entry_end="A",
        )
        monkeypatch.setattr(wavefront_module, "min_cost_astar", lambda *args, **kwargs: None)
        monkeypatch.setattr(
            explorer,
            "_find_same_wall_replacement",
            lambda *_args, **_kwargs: replacement,
        )

        recovered = explorer._recover_committed_trajectory("target_invalid_no_path")

        assert recovered
        assert explorer.commitment_active
        assert explorer.committed_wall_segment_id == "wall_12"
        assert explorer.committed_direction == 1
        assert explorer.committed_end_target == replacement.goal
        assert published[-1][0] == "recover_same_wall"
    finally:
        explorer.stop()


def test_same_wall_recovery_failure_switches_away(quick_costmap, monkeypatch) -> None:
    explorer = WavefrontFrontierExplorer(max_committed_plan_failures=1, max_committed_recovery_failures=1)
    costmap, _ = quick_costmap

    try:
        explorer.latest_costmap = costmap
        explorer.latest_odometry = make_pose(0.0, 0.0)
        explorer.commitment_active = True
        explorer.committed_wall_segment_id = "wall_12"
        explorer.committed_direction = 1
        explorer.committed_entry_end = "A"
        explorer.committed_end_target = Vector3(2.0, 0.0, 0.0)
        explorer.committed_waypoints = [make_pose(2.0, 0.0)]

        monkeypatch.setattr(wavefront_module, "min_cost_astar", lambda *args, **kwargs: None)
        monkeypatch.setattr(
            explorer,
            "_find_same_wall_replacement",
            lambda *_args, **_kwargs: None,
        )

        recovered = explorer._recover_committed_trajectory("target_invalid_no_path")

        assert not recovered
        assert not explorer.commitment_active
    finally:
        explorer.stop()


def test_performance_timing() -> None:
    """Test performance by timing frontier detection operations."""
    import time

    # Test with different costmap sizes
    sizes = [(20, 20), (40, 40), (60, 60)]
    results = []

    for width, height in sizes:
        # Create costmap of specified size
        costmap, lidar = create_test_costmap(width, height)

        # Create explorer with optimized parameters
        explorer = WavefrontFrontierExplorer(
            min_frontier_perimeter=0.3,
            safe_distance=0.5,
            info_gain_threshold=0.02,
        )

        try:
            robot_pose = lidar.origin

            # Time frontier detection
            start = time.time()
            frontiers = explorer.detect_frontiers(robot_pose, costmap)
            detect_time = time.time() - start

            # Time goal selection
            start = time.time()
            explorer.get_exploration_goal(robot_pose, costmap)
            goal_time = time.time() - start

            results.append(
                {
                    "size": f"{width}x{height}",
                    "cells": width * height,
                    "detect_time": detect_time,
                    "goal_time": goal_time,
                    "frontiers": len(frontiers),
                }
            )

            print(f"\nSize {width}x{height}:")
            print(f"  Cells: {width * height}")
            print(f"  Frontier detection: {detect_time:.4f}s")
            print(f"  Goal selection: {goal_time:.4f}s")
            print(f"  Frontiers found: {len(frontiers)}")
        finally:
            explorer.stop()

    # Check that larger maps take more time (expected behavior)
    for result in results:
        assert result["detect_time"] < 3.0, f"Detection too slow: {result['detect_time']}s"
        assert result["goal_time"] < 1.5, f"Goal selection too slow: {result['goal_time']}s"

    print("\nPerformance test passed - all operations completed within time limits")
