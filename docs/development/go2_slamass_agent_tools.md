# Go2 SLAMASS Agent Tools

Dense reference for the next agent-layer buildout. Goal: make the chat agent good at `locate`, `present`, `verify`, and `act` without turning it into an ungrounded autonomy blob.

## Core Stance

- The agent should operate over `semantic memory + UI tools + selected robot tools`.
- The agent should not be the geometry engine, state estimator, or teleop loop.
- Prefer backend macro tools over hoping the model composes many low-level calls correctly.
- For spatial questions, the agent should usually both `answer` and `show`.

## Dataset Model

- `VLM POI`
  - sparse
  - scene/place-level
  - has `anchor_x/y/yaw` = capture viewpoint
  - has `target_x/y` = semantic place location on the map
- `YOLO object`
  - denser
  - concrete object-level
  - has `world_x/y/z` = object location
  - has `best_view_x/y/yaw` = robot pose to see it well

The agent should treat these as one semantic dataset with modality-specific geometry.

## Tool Set

### 1. Runtime / State

- `get_runtime_overview()`
  - connectivity, robot pose, counts, layer visibility, current selected item, current embodied action
- `get_map_status()`
  - map loaded, updated_at, bounds, save status
- `get_robot_context()`
  - robot pose, path length, current selected item, current action status

### 2. Retrieval

- `search_semantic_memory(query, kind, limit)`
  - current lexical search
- `search_semantic_memory_semantic(query, kind, limit)`
  - embedding-backed retrieval; primary tool for natural-language search
- `get_semantic_item(kind, entity_id)`
  - full item detail
- `list_recent_semantic_items(kind, limit)`
  - useful for “what did we just find?”
- `list_notable_places(limit)`
  - high-interest VLM POIs ranked for demo presentation
- `list_notable_objects(limit, labels?)`
  - high-confidence YOLO objects

### 3. Spatial Query

- `find_items_near_robot(kind, radius_m, limit)`
- `find_items_near_item(kind, entity_id, neighbor_kind, radius_m, limit)`
- `find_items_in_radius(center_x, center_y, radius_m, kind, limit)`
- `find_nearest_item_to_point(x, y, kind)`
- `find_nearest_item_to_item(kind, entity_id, neighbor_kind)`
- `find_candidate_pairs(primary_query, secondary_query, radius_m, limit)`
  - examples: `chair near window`, `table near laptop`

These should be deterministic backend tools. The model should not be doing ad hoc geometry in-context.

### 4. UI / Presenter Control

- current MVP stance: keep map camera, pan/zoom, and semantic selection manual in the operator UI
- `set_layer_visibility(show_pois?, show_yolo?)`
- presenter-facing action feedback should come from lightweight notifications, not agent-driven zoom/highlight state mutation

### 5. Navigation / Verification

- `go_to_semantic_item(kind, entity_id)`
  - VLM uses anchor pose; YOLO uses best-view pose
- `go_to_coordinates(x, y, yaw?)`
  - explicit coordinate navigation, not teleop
- `inspect_now()`
- `look_current_view(query)`
- `go_to_and_verify(kind, entity_id, query?)`
  - macro: navigate to view pose, inspect, answer whether target is visible / what changed
- `verify_current_candidate_set(items, query)`
  - useful after search ambiguity

This is the most valuable next macro category for demo quality.

### 6. Memory Maintenance

- `save_map()`
- `set_yolo_runtime(mode)`
- `rescan_poi(poi_id)`
- `create_poi_here(force?, title_hint?)`
- `delete_semantic_item(kind, entity_id)`
  - explicit user request only

### 7. Robot Expression / Physical Actions

- `speak(text)`
  - high-value demo tool; OpenAI-only path already exists in repo
- `relative_move(forward, left, degrees)`
  - only for small local adjustments
- `wait(seconds)`
- `list_sport_commands()`
- `execute_sport_command(command_name)`

## Recommended Macro Skills

These are the high-level skills the agent should feel like it has:

- `show me three notable places`
  - `list_notable_places` -> `present_semantic_results`
- `where is something like a window / kitchen / desk area`
  - semantic search -> presentation
- `what interesting things are near us`
  - `find_items_near_robot`
- `show objects near this place`
  - selected item -> `find_items_near_item`
- `take me to the best match`
  - search -> choose best -> `go_to_semantic_item`
- `go check if it is still there`
  - `go_to_and_verify`
- `what does the robot see right now`
  - `look_current_view`
- `prepare the map for the presenter`
  - layer toggles + optional save

## Priority Order

1. `embedding search`
2. `spatial query tools`
3. `present_semantic_results`
4. `go_to_and_verify`
5. `speak`
6. `rescan_poi`

## Rules For The Prompt

- Search memory first.
- For spatial answers, usually drive the UI too.
- Prefer macro tools over many low-level calls.
- Use `look_current_view` when memory may be stale.
- Use `relative_move` only for small corrections.
- Do not delete without explicit user intent.
- Do not use teleop or kill/stop tools.
- Be brief and presenter-friendly.
