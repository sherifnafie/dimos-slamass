# Go2 SLAMASS Demo

## Status

Dense product and engineering reference for the current hackathon pivot.

This document supersedes the earlier "semantic map blocks over BEV" direction as the main product concept. The old work is still useful as infrastructure, but the product surface, user experience, and prioritization are now different.

Internal name:

- `SLAMASS`
- expansion: `Simultaneously Located and Mapped Semantic Segmenting map`
- actual meaning in practice: a navigable SLAM map with floating semantic point-of-interest windows anchored into the mapped world

This is intentionally written as a buildable reference, not a pitch deck. It is opinionated, practical, and optimized for a live competition demo with a real Go2.

### Current MVP State

The repo now already contains a working first pass of this concept:

- runtime blueprint: `unitree-go2-slamass-mcp`
- sidecar service / CLI: `dimos-slamass`
- web UI: side-by-side POV and persisted SLAMASS map
- persistent active-map storage under `~/.local/state/dimos/slamass/`
- manual `Inspect Now` using OpenAI vision
- floating VLM POI cards with detail modal and delete
- a second semantic layer built from live YOLO detections, promoted into persistent world objects after repeated hits
- YOLO object detail, `Go To`, delete, pause/resume ingestion, and layer visibility controls
- VLM POIs now track both `anchor_x/y/yaw` for the capture viewpoint and `target_x/y` for the semantic place location
- `Go To` wired to the stored POI viewpoint pose, meaning the saved anchor `x`, `y`, and viewing `yaw`
- `Go To` for YOLO objects wired to the saved best-view robot pose rather than the object centroid
- a service-owned UI command layer for map focus state, selection, highlights, and camera control, so future agent-driven zoom/highlight behavior has a clean path
- an operator chat panel backed by a service-owned agent that can search semantic memory, manipulate the SLAMASS UI, inspect the current view, navigate to saved semantic items, toggle semantic layers, pause or resume YOLO ingestion, save the map, and use a curated set of robot MCP tools

Still roadmap rather than current reality:

- opportunistic autonomous inspection while moving
- stronger dynamic-object suppression
- first-class saved-SLAM relocalization across cold restarts

## One-Sentence Product Definition

Build a remote operator web UI with two synchronized feeds: the robot's first-person camera view and a SLAM-backed 2D map overlaid with floating semantic POI windows generated from robot observations and OpenAI vision.

## Product Thesis

The core product is not "semantic occupancy."

The core product is:

- a reliable navigation map for robot motion
- a curated set of semantic POIs grounded in real robot viewpoints
- a visually compelling UI that makes those POIs feel spatially embedded in the mapped world

The SLAM map is infrastructure, not the hero.

The hero is the experience that the robot is remotely exploring a building and leaving behind meaningful "semantic windows" that a presenter can inspect and act on.

## Competition-Framed Goal

From a demo and judging perspective, the winning impression is not "we built a robotics backend." The winning impression is:

- the robot can move around remotely
- the system remembers the environment
- the UI shows where interesting things are in a spatially grounded way
- the operator can click places, inspect them, and send the robot there
- later, a language layer can reason over those saved semantic places

That means the product should optimize for:

- visual clarity
- reliability
- understandable abstractions
- low operator confusion
- low latency in the visible interaction loop

It should not optimize for:

- dense research-grade semantic SLAM
- perfect long-term localization
- generic autonomous agency everywhere
- complicated multi-stage autonomy that may fail unpredictably on stage

## Core Demo Story

The demo presenter opens a web UI and sees:

- left: the live first-person POV from the Go2
- right: the SLAMASS map, a 2D top-down navigation map with floating semantic windows anchored into locations around the space

As the robot moves through a pre-mapped building:

- the operator can manually trigger an inspection
- the operator can choose between `AI Gate` and `Always Create` for manual inspections
- or later the robot can opportunistically inspect as it walks
- the system captures a frame plus pose
- a VLM describes what the robot is seeing
- the inspection gate is intentionally permissive by default: it should reject only frames with almost no usable semantic content, such as blank walls, heavy blur, or contextless close-ups
- a second LLM layer decides whether the observation is notable enough to become a POI
- if accepted, the system stores the frame, a thumbnail, the semantic description, and the world pose
- a floating spatial card appears on the map

Clicking a floating window opens the POI:

- full image
- title
- summary
- why it was tagged
- buttons like `Go To`, `Delete`, `Rescan`

The operator can now also use a chat panel:

- the agent searches the saved semantic dataset first
- the agent can highlight and focus the map while answering
- the agent can also change layer visibility, pause or resume YOLO, and save the map when explicitly asked
- the agent can command navigation back to saved POIs or YOLO object viewpoints
- the agent can inspect the current view or use selected relative robot actions when needed
- example: "go somewhere with a window"

## What the Product Actually Is

The product is best understood as a layered system.

### Layer 1: Navigation / SLAM Substrate

This is the existing DimOS SLAM and navigation stack. It gives:

- robot pose
- occupancy or cost map
- click-to-go
- path planning
- map visualization

This layer is necessary but mostly invisible as product value. It exists so the robot can move and the UI can place semantic anchors in a shared spatial frame.

### Layer 2: Semantic POI Memory

This is the actual product memory layer.

Each POI is a saved observation tied to:

- `anchor_x`
- `anchor_y`
- `anchor_yaw`
- `target_x`
- `target_y`
- a thumbnail image
- the original full image
- semantic summary
- title
- category
- confidence / interest score
- creation time
- last verified time

This is sparse, curated, and operator-meaningful.

There are now two semantic modalities inside this memory layer:

- `VLM anchors`: sparse, manually triggered scene/place observations backed by a full frame and a richer semantic summary
- `YOLO objects`: denser, automatically promoted world objects backed by repeated 3D detections and a best crop / best-view pose

These should be treated as one semantic dataset with two different acquisition paths.

Related dense design note for future agent work:

- `docs/development/go2_slamass_agent_tools.md`

### Layer 3: UI Visualization

This is what judges see.

The UI must communicate:

- where the robot is
- what it is looking at
- what interesting places it has found
- what persistent concrete objects it has recognized
- how those places relate to the map

The UI should feel like an augmented memory of the space, not like a raw robotics dashboard.

### Layer 4: Agent Layer

This is now part of the MVP, but still intentionally constrained.

It should reason over:

- the POI database
- the YOLO object dataset
- navigation actions
- inspection actions
- selected safe MCP tools
- selected UI-control tools for the SLAMASS map and POI layer

It should not reason directly over raw locomotion and map pixels unless necessary.

Important future capability:

- the agent should not be limited to text responses and robot commands
- it should also be able to manipulate the SLAMASS UI state in presenter-visible ways
- example UI actions: zoom map to region, pan to POI, highlight one or more POIs, focus the selected POI card, open a POI detail panel, or briefly spotlight a search result

This matters because a good live demo is interactive, not purely verbal. If a user asks "where is the window area?" the best response is not just text. The best response is for the agent to answer while simultaneously driving the UI toward the relevant part of the map.

Current implementation stance:

- the agent is service-owned, not embedded in the browser
- the agent works through an explicit tool layer rather than raw frontend state mutation
- semantic search, map focus/highlight, and semantic-item navigation are first-class tools
- robot action tools are intentionally curated rather than fully open-ended
- the agent should prefer semantic memory plus UI actions before using low-level robot motion

## Why This Pivot Is Better Than Dense Semantic Mapping

The previous direction was drifting toward "fill a BEV grid with semantic information."

That is interesting technically but weak for a live demo because:

- per-cell semantics are hard to understand visually
- dense labeling is expensive and noisy
- the robot does not perceive from arbitrary cells, only from viewpoints
- judges care more about memorable places than cell statistics

POI windows solve this:

- each semantic artifact is backed by an actual frame the robot saw
- the UI can show real images, not abstract labels
- the semantics feel trustworthy because they are tied to visible evidence
- the map becomes a stage for spatial memory, not a research visualization

## Product Requirements

### Must-Have for the Demo

- side-by-side web UI with live POV and map
- a reusable pre-built map for the demo environment
- manual inspection command from the UI
- OpenAI-powered semantic analysis of inspected frames
- POIs stored with pose and image assets
- POIs shown as floating 2D windows on the map
- clickable POIs with detail view
- `Go To` action for a POI
- `Delete` action for a POI

Important detail:

- `Go To` should navigate to the saved viewpoint pose `x, y, yaw`, not just the translational anchor

### Strongly Desired

- background thumbnail generation
- POI deduplication so repeated inspections do not spam the map
- visual selection / focus state
- async loading states so the UI feels alive while the VLM runs
- persistence of POIs and images across service restarts

### Nice to Have

- autonomous opportunistic inspection while the robot walks
- rescan / refresh existing POIs
- chat over POI memory plus MCP
- voice or scripted demo prompts

### Explicit Non-Goals for v1

- dense semantic segmentation over the full map
- 3D scene graph reconstruction
- reliable multi-floor mapping
- perfect loop closure and global relocalization
- general-purpose fully autonomous exploration
- manipulation

## User Experience Specification

## Layout

The primary screen is a two-feed layout.

### Left Feed: POV

Purpose:

- show what the robot sees right now
- make the remote demo feel alive
- give the presenter confidence that semantic tags correspond to real visual input

Requirements:

- near-live image stream or frequent frame updates
- status indicator for stream freshness
- optional small overlay with current pose and heading

Implementation note:

- a true video stream is ideal
- a fast image relay is acceptable for hackathon MVP
- if real streaming is hard, polling `observe()` at a controlled rate is still visually sufficient

### Right Feed: SLAMASS

Purpose:

- show the mapped environment
- show robot pose
- show saved semantic POIs as floating windows
- act as the interaction surface for navigation and POI selection

Requirements:

- map remains readable under zoom / pan
- POI windows do not completely obscure navigation context
- selected POI becomes visually dominant
- POIs should feel like anchored windows, not map pins

## POI Window Visualization

The map markers should look like miniature floating windows, not standard dots.

Recommended visual language:

- rounded card
- thumbnail image as primary face
- short title beneath or overlaid
- subtle perspective, shadow, or tether line to anchor point
- selected state enlarges or brightens
- hover state lifts slightly

Important constraint:

- these cards must be visually rich enough to sell the demo
- but density must be capped so the map does not become unusable

Recommended rules:

- prioritize showing POIs in the current viewport
- collapse low-priority POIs at far zoom levels
- allow only one fully selected/focused POI at a time
- optionally screen-space nudge cards to reduce overlap while keeping anchor positions fixed

## POI Detail View

When a POI is clicked:

- the selected frame becomes much larger
- the user sees the full stored image
- title and summary are visible immediately
- actions are obvious and near the content

Actions:

- `Go To`
- `Delete`
- `Rescan`
- later: `Ask Chat About This`

The detail interaction should feel like opening a spatial memory object, not like inspecting a row in a database.

## Operator Workflows

### Workflow A: Premapping Before Demo

The team maps the building ahead of time.

Goal:

- ensure the map is already good before the presenter goes live
- avoid spending demo time on raw SLAM setup

Practical reality:

- current DimOS Go2 navigation docs describe live column-carving mapping and explicitly note drift over time; there is no obvious shipped, first-class "save SLAM session and restore later" flow exposed in the codebase
- there is a debug path for loading a predefined occupancy grid in MuJoCo via `mujoco_global_costmap_from_occupancy`, but that is not a turnkey real-robot map-persistence product path

This means premapping needs a practical strategy, not wishful thinking.

#### Premap Strategy Options

#### Option 1: Keep the runtime alive after premapping

Process:

- start the navigation stack before the demo
- explore and map the space
- do not tear the runtime down
- use the same long-running process during the demo

Pros:

- easiest
- no import/export system needed

Cons:

- operationally fragile over long periods
- harder to restart safely if something crashes

This is the fastest hackathon fallback.

#### Option 2: Export and reload a static occupancy snapshot

Process:

- generate a 2D occupancy grid after premapping
- save it as a file
- reload it on demo day as the navigation / visualization substrate

Pros:

- deterministic demo substrate
- restartable
- enough for a spatial UI even if full SLAM state cannot be restored

Cons:

- not the same as true SLAM session restoration
- relocalization must be handled separately or operationally simplified

This is the best realistic medium-term solution if true session restore is unavailable.

#### Option 3: Use the map only as a visualization memory layer

Process:

- store the occupancy snapshot and POIs for UI only
- keep navigation tied to the live runtime
- if exact map reuse is hard, keep semantic coordinates in the same operating session

Pros:

- easiest to ship semantically

Cons:

- weaker if the robot restarts or reboots

### Recommended Competition Choice

For the hackathon:

- first aim for Option 1 if operationally acceptable
- in parallel design the system so Option 2 can replace it later

The product doc should assume we want reusable map snapshots, but the delivery plan should not depend on solving full relocalization if the codebase does not already support it.

### Workflow B: Manual Inspection During Demo

This is the most important MVP behavior.

The operator:

- sees the live POV
- sees the map
- commands the robot somewhere
- clicks `Inspect Here` or `Inspect Current View`

System behavior:

1. capture current frame from the robot
2. capture current pose and heading
3. call a VLM to fully describe the frame
4. call a second model or structured decision layer to decide if this frame is worth keeping as a POI
5. if yes, store POI and render a floating card on the map
6. if no, surface a quiet "not noteworthy" result without cluttering the map

This is robust, visually legible, and easy to narrate in a demo.

### Workflow C: Autonomous Inspection While Moving

This is v2, not v1.

As the robot walks a route:

- candidate frames are sampled periodically
- candidate frames are described by a VLM
- an agent or gating model decides whether to promote them into POIs

Trigger heuristics should be simple and deterministic before invoking the model:

- minimum distance moved since last accepted POI
- minimum yaw change
- minimum elapsed time
- optional map novelty or unexplored-region signal

This keeps cost, latency, and spam under control.

## Core Data Model

The system should stop thinking in terms of "semantic blocks" and instead use a model closer to what the UI needs.

### `MapSnapshot`

Represents the spatial substrate for a demo session.

Fields:

- `map_id`
- `name`
- `created_at`
- `source_type` such as `live_session`, `saved_occupancy`, `replay`
- occupancy grid artifact path or blob reference
- optional metadata like resolution, origin, dimensions
- optional notes about environment / building / floor

### `Poi`

Represents a stable map-visible semantic point of interest.

Fields:

- `poi_id`
- `map_id`
- `world_x`
- `world_y`
- `world_yaw`
- `title`
- `summary`
- `category`
- `interest_score`
- `status` such as `active`, `hidden`, `deleted`
- `thumbnail_path`
- `hero_image_path`
- `created_at`
- `updated_at`
- optional `embedding`

### `PoiObservation`

Represents one observation that may create or reinforce a POI.

Fields:

- `observation_id`
- `poi_id` nullable before merge
- `world_x`
- `world_y`
- `world_yaw`
- `image_path`
- full VLM description
- gating result
- raw model metadata
- created time

This matters because a POI is a stable UI object, while an observation is raw evidence.

### `PoiAsset`

Image artifacts for UI:

- full-res original
- downsampled card thumbnail
- optional medium-resolution detail view

### `MapPoseAnchor`

Optional future helper for navigation:

- named or verified anchor poses
- entrance
- docking position
- operator-defined points

## Semantic Tagging Pipeline

The tag generation pipeline should be explicit and conservative.

### Step 1: Acquire Observation

Input sources:

- manual inspect button
- autonomous periodic sampling later

Required captured data:

- image
- `x`
- `y`
- `yaw`
- timestamp
- current map / session id

### Step 2: VLM Description

Use OpenAI vision to produce a rich but structured frame description.

The VLM should output JSON with fields like:

- `scene_title_candidate`
- `full_description`
- `salient_objects`
- `possible_category`
- `notable_features`
- `navigational_relevance`
- `contains_text`
- `estimated_interest`

The VLM's job is descriptive, not curatorial.

### Step 3: Gating / Promotion Decision

A second LLM or structured classifier decides whether the observation deserves to become a visible POI.

This layer should answer:

- is this noteworthy enough to visualize?
- is it likely duplicate of an existing nearby POI?
- if accepted, what is the concise operator-facing title?
- if rejected, why?

Promotion criteria should reward:

- landmarks
- destination-like places
- objects useful for language queries
- visually distinctive areas
- places a presenter would actually click

Promotion criteria should penalize:

- blank walls
- floor closeups
- unremarkable hall segments
- near-duplicates
- transient clutter unless it is specifically important

### Step 4: Merge or Create

If a nearby POI already exists and the new observation is semantically similar:

- attach as another observation
- update the POI if the new frame is better

Otherwise:

- create a new POI

Dedup should use:

- distance threshold
- yaw similarity or viewpoint compatibility
- title / summary similarity
- category similarity

### Step 5: Asset Generation

Store:

- full image
- lightweight thumbnail for the floating card

The card asset must be intentionally small because map UIs may show many POIs at once.

### Step 6: Visualization

Render the POI on the map only after the record is successfully stored.

Do not display uncommitted or unstable POIs as permanent objects.

## Why Manual Inspection Should Come First

Manual inspection is the correct initial behavior because:

- it is demoable immediately
- it is easy to explain
- it produces much higher-quality POIs than blind autonomous sampling
- it avoids flooding the map
- it gives the team direct control over what becomes visible

Autonomous inspection should be added only after:

- POI storage works
- UI rendering is good
- dedup works
- operator trust in the tags is high

## Recommended Model Roles

Use two logical model roles, even if both are OpenAI models.

### Model A: Vision Describer

Purpose:

- fully describe what is visible
- extract salient objects and scene semantics

This model should not decide UI promotion directly.

### Model B: POI Curator

Purpose:

- decide whether the observation is worth becoming a visible POI
- name it
- reject duplicates
- choose a concise operator-facing category

This separation is important because descriptive models tend to happily describe everything, while the product needs selectivity.

## UI Design Principles

### The Map Should Feel Like Spatial Memory, Not GIS

This is not a cartography app. It is a remote memory browser for a robot.

That means:

- richer cards beat tiny pins
- real images beat symbolic icons
- selection and focus matter more than dense overlays
- the UI should feel cinematic enough to carry a live demo

### The POV Feed and Map Must Stay Synchronized Conceptually

The presenter should always be able to tell:

- what the robot sees now
- where that is on the map
- what past interesting views have already been saved nearby

### The UI Should Tolerate Sparse Content Gracefully

At the beginning of the demo, there may be few POIs.

That is fine.

The empty state should still look intentional:

- map visible
- robot pose visible
- clear `Inspect` affordance
- subtle message that semantic points appear as the robot inspects the space

## Backend Architecture

The architecture should remain sidecar-based and build on existing DimOS primitives.

### Existing Runtime Components to Reuse

- Go2 navigation / mapping runtime
- websocket visualization server on `:7779`
- MCP server on `:9990`
- `observe`
- `current_pose`
- navigation actions

Concrete current pieces in this repo:

- blueprint: `unitree-go2-slamass-mcp`
- sidecar process: `dimos-slamass`
- websocket event used for long-term map ingestion: `raw_costmap`
- active persisted map root: `~/.local/state/dimos/slamass/`

### New Product Service

Recommended name:

- continue using the semantic-map service as the base, but conceptually evolve it into the `SLAMASS service`

Responsibilities:

- serve the web UI
- subscribe to map state
- relay or proxy POV frames
- handle manual inspect requests
- call OpenAI models
- store POIs and assets
- expose POI APIs
- later expose agent/chat APIs

### Storage Responsibilities

Persist separately:

- active map metadata
- active occupancy artifact and preview image
- POIs
- POI observations
- thumbnails
- full images

This separation matters because:

- map substrate may change independently of semantic memory
- POIs may need to survive UI restarts
- observations are useful for debugging and future rescoring

## POV Feed Implementation Options

This matters because the left feed is one of the two hero surfaces.

### Option A: Poll `observe()` Frequently

Pros:

- easiest
- uses existing MCP tool
- enough for a convincing remote feed if rate is decent

Cons:

- not true streaming
- may be bandwidth- and latency-heavier than a dedicated feed

This is acceptable for MVP.

### Option B: Add a Dedicated Video Relay Endpoint

Pros:

- smoother
- better UX

Cons:

- more engineering
- depends on how easily the latest video frame can be surfaced into the service or frontend

Recommendation:

- start with Option A if necessary
- make the UI design good enough that a near-live feed still looks intentional

## Map Persistence and Reality Check

This is the most important engineering caveat in the whole concept.

The product wants "build the SLAM map before the demo and reuse it later."

That is correct as a product need.

But the codebase reality appears to be:

- live Go2 mapping and navigation are well-supported
- dynamic clearing via column-carving is supported in the live mapper
- a real-robot production map save/load or relocalization loop is not obviously shipped as a user-facing flow

Therefore the plan must explicitly distinguish:

- desired product behavior
- available infrastructure
- hackathon fallback behavior

### Practical Recommendation

For the hackathon, define success in descending order:

1. same long-running mapped runtime survives into demo
2. saved occupancy grid reused as a static substrate
3. if neither is ready, demo in a bounded environment mapped shortly before presenting

Do not let full SLAM persistence block the rest of the product.

The semantic POI system is valuable even if the map substrate is operationally constrained.

## Navigation Semantics

For `Go To This Location`, the navigation target should be:

- the stored `x, y, yaw` viewpoint pose from the accepted observation
- not merely the semantic anchor position
- not merely `x, y` with a default heading

The POI does not need to be a precise object pose. It needs to be a good viewpoint pose.

That is another reason this concept is practical:

- the product stores "where the robot was when it saw this thing and what direction it was facing," not "where the object physically is" in full 3D

## Chat Layer, Later

The eventual chat product should reason over POIs first, not over raw map cells.

Desired behavior:

- user asks a spatial-semantic question
- system searches POI memory
- if a good match exists, it navigates or answers
- if the memory is weak, the system can propose inspection

Example:

- "can you go somewhere with a window"
- search POIs for `window`
- choose best POI
- call MCP navigation

Extended desired behavior:

- when answering a spatial question, the agent should also be able to trigger UI-side actions on the SLAMASS frontend
- examples: zoom into the relevant region, highlight candidate POIs, select the best POI, open its detail card, or center the map on the current answer

This implies the future chat layer should have a second tool family in addition to robot MCP:

- robot tools: move, inspect, navigate, rescan
- UI tools: zoom map, pan map, highlight POIs, select POI, clear highlight, open detail view

The interaction target is a mixed initiative system:

- the agent explains what it found
- the UI visibly follows the explanation
- the presenter can immediately see and validate what the agent means

This makes the LLM operate over high-value semantic memory rather than raw robot primitives.

## Risks and Failure Modes

### Risk: Too Many POIs

If every frame becomes a tag, the UI collapses.

Mitigation:

- conservative gating
- strong dedup
- operator-delete
- per-zone density caps later

### Risk: POIs Feel Arbitrary

If the system tags boring things, the demo looks unserious.

Mitigation:

- strong curator prompt
- manual inspection first
- reject generic frames

### Risk: Map and POIs Drift

If pose drift accumulates, floating windows may look slightly wrong.

Mitigation:

- premap bounded area
- keep the runtime stable
- use viewpoint poses rather than fine object geometry
- rescan important POIs near demo time

### Risk: VLM Latency

If the inspection takes too long, the UI feels dead.

Mitigation:

- immediate loading placeholder
- async POI creation
- thumbnail appears only after commit
- manual inspect is acceptable if it takes a few seconds, as long as feedback is immediate

### Risk: No True SLAM Reuse

Mitigation:

- operational fallback plan documented above
- semantic layer designed to be map-id scoped and portable

### Risk: Left Feed Is Not Smooth Enough

Mitigation:

- frame relay or rapid polling
- focus on consistency over perfect frame rate

## Build Priorities

### Phase 1: Demo Surface

- side-by-side POV + map UI
- map visible and navigable
- no semantic POIs yet required

Definition of done:

- presenter can show robot view and map simultaneously

### Phase 2: Manual Inspection + POI Storage

- button to inspect current view
- frame + pose capture
- VLM describe
- gate and store
- floating POI window appears

Definition of done:

- presenter can deliberately create a semantic memory object on stage

### Phase 3: POI Detail and Navigation

- click POI
- open detail
- `Go To`
- `Delete`
- optional `Rescan`

Definition of done:

- POIs become operational, not just visual

### Phase 4: Premapped Demo Workflow

- establish one of the premapping strategies
- ensure the presenter does not need to raw-map the space live

Definition of done:

- demo starts with a usable map

### Phase 5: Opportunistic Autonomous Inspection

- inspect while traversing route
- rate limited
- deduped

Definition of done:

- robot can build POIs while moving without operator micromanagement

### Phase 6: Chat + MCP

- query POI memory
- navigate to POI from language
- control the SLAMASS UI from language for presenter-visible interaction

Definition of done:

- "go somewhere with a window" works against stored semantic memory
- "where is the window area" can answer while zooming and highlighting the relevant map content

## Technical Recommendations

### Recommendation 1: Keep the Map Boring

The navigation map should be boring, deterministic, and trustworthy.

Do not overload it with semantic logic.

### Recommendation 2: Make the POIs Rich

The POIs are the product object.

They should have:

- image
- short label
- meaningful summary
- spatial anchor
- actions

### Recommendation 3: Separate Observation From Promotion

Capture many observations if needed, but promote few.

### Recommendation 4: Prioritize UI Taste

Because this is a demoed product, UI quality is not optional.

The POIs should look intentional and memorable.

### Recommendation 5: Treat Premapping as an Ops Problem, Not Just a Code Problem

The demo depends on it.

Have a concrete runbook for:

- when the space is mapped
- whether the runtime stays alive
- how to recover if it crashes
- whether a static occupancy snapshot exists

## Open Questions

- What exact map persistence strategy will we ship for the demo: same-runtime continuity, occupancy export/import, or something more advanced?
- Will the POV feed be true streaming or observe-based polling in the first version?
- Should manual inspect capture one frame or a short burst around the current heading?
- How strict should viewpoint restoration be when `Go To` uses saved `yaw` on noisy maps?
- Do we want hidden POIs or hard delete only?
- Do we want operator-created custom labels later?

## Final Summary

SLAMASS should not be treated as "semantic SLAM" in the research sense.

It should be treated as:

- a reliable 2D map substrate
- plus a sparse, curated, visually grounded semantic memory layer
- exposed through a remote operator UI with a live POV feed and spatial POI windows

If built this way, the system will feel impressive, understandable, and controllable in a competition setting.

That is the right target.
