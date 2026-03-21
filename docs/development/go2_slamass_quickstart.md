# Go2 SLAMASS Quick Start

This runbook starts the SLAMASS MVP: a live two-pane web UI with robot POV on the left and a persisted semantic occupancy map on the right.

## What You Get

- Live first-person robot feed from `observe()`
- Persisted downsampled BEV occupancy memory built from the raw SLAM costmap
- Manual `Inspect Now` flow using OpenAI vision
- Floating POI cards on the map with thumbnail, title, detail view, `Go To`, and `Delete`
- Saved map and POIs under `~/.local/state/dimos/slamass/`

## Important Scope Note

SLAMASS currently persists its own occupancy memory and semantic POIs.

It does **not** currently persist and restore the robot stack's full internal SLAM relocalization state. For a polished demo, either:

- keep the robot runtime alive after premapping, or
- restart near the premapped area and let the robot rebuild enough live SLAM for navigation while SLAMASS reloads its saved occupancy memory and POIs

## One-Time Setup

From the repo root:

```bash
source .venv/bin/activate
uv sync --all-extras --no-extra dds
cd dimos/web/slamass-app
npm install
npm run build
cd /home/deadimex/dimos
```

## Start In Sim

Shell 1:

```bash
source .venv/bin/activate
dimos --simulation --viewer none run unitree-go2-slamass-mcp --daemon
```

Check that the stack is up:

```bash
dimos status
dimos mcp list-tools
```

Shell 2:

```bash
source .venv/bin/activate
export OPENAI_API_KEY=...
dimos-slamass
```

Open:

```text
http://localhost:7780
```

## Start On The Real Go2

Shell 1:

```bash
source .venv/bin/activate
dimos --robot-ip 192.168.123.161 --viewer none run unitree-go2-slamass-mcp --daemon
```

Check that the stack is up:

```bash
dimos status
dimos mcp list-tools
```

Shell 2:

```bash
source .venv/bin/activate
export OPENAI_API_KEY=...
dimos-slamass
```

Open:

```text
http://localhost:7780
```

## Smoke Test

1. Confirm the left pane shows live POV.
2. Confirm the right pane starts blank and then fills as raw costmap updates arrive.
3. Move the robot a little. The robot marker and path should update.
4. Click the map. The robot should receive a navigation goal.
5. Press `Inspect Now`.
6. If the frame is interesting, a floating POI card should appear on the map.
7. Click the POI card. The detail modal should open with the full image and semantic description.
8. Press `Go To` in the POI modal. The robot should navigate back to that POI anchor.
9. Press `Save Map`.

## Persistence Check

SLAMASS stores state here:

```text
~/.local/state/dimos/slamass/
```

Key artifacts:

- `slamass.db`
- `maps/active_map.npz`
- `maps/active_map.png`
- `images/*.jpg`

To verify persistence:

1. Create at least one POI.
2. Press `Save Map`.
3. Stop only `dimos-slamass`.
4. Restart `dimos-slamass`.
5. Reload the browser.

Expected result:

- the right-side map reloads from disk
- existing POIs reappear
- the live POV resumes once the service reconnects to MCP

## Useful Commands

```bash
dimos status
dimos log -f
dimos stop
dimos mcp list-tools
dimos-slamass --help
```

## Current MVP Behavior

- The right map is built from the new `raw_costmap` websocket event, not the inflated visualization map.
- The occupancy memory is long-term and persisted, but still updates live when space opens or closes.
- `Inspect Now` captures the robot's current frame only. There is no autonomous sweep capture yet.
- OpenAI vision returns both the semantic description and the create/reject gate in one call.
- Duplicate inspections near the same pose and facing the same direction update an existing POI instead of creating a new one.

## If Something Looks Broken

If the browser loads but the map never fills:

```bash
dimos status
dimos log -n 100
```

If the service starts but says it cannot connect to the websocket map source:

- the Go2 runtime is not up yet, or
- `:7779` is not serving the websocket visualization stack

If the POV never appears:

```bash
dimos mcp list-tools
```

`observe` should be present. If it is missing, the wrong blueprint is running.
