# Go2 SLAMASS Quick Start

This runbook starts the SLAMASS MVP: a live two-pane web UI with robot POV on the left and a persisted semantic occupancy map on the right, now with both VLM POIs and live-promoted YOLO objects.

## What You Get

- Live first-person robot feed from `observe()`
- Persisted downsampled BEV occupancy memory built from the raw SLAM costmap
- Manual `Inspect Now` flow using OpenAI vision
- Floating VLM POI cards on the map with thumbnail, title, detail view, `Go To`, and `Delete`
- Live YOLO ingestion that promotes repeated detections into persistent map objects
- YOLO layer visibility toggle and live/pause runtime control in the UI
- Agent chat tab in the operator rail for semantic search, map/UI control, semantic navigation, layer and YOLO runtime control, map save, and curated robot actions
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
cd ../../..
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
# Optional: chat agent + Inspect Now / VLM need a key when you use those features.
# dimos-slamass starts without OPENAI_API_KEY; chat shows a disabled message until set.
export OPENAI_API_KEY=...   # optional
dimos-slamass
```

Open:

```text
http://localhost:7780
```

### Dev UI on port 3001 (Vite)

For a fast React reload loop, run the sidecar on **7780** and the Vite dev server on **3001**:

```bash
# Terminal A: robot stack (same as Shell 1 above)
dimos --simulation --viewer none run unitree-go2-slamass-mcp --daemon

# Terminal B
uv run dimos-slamass

# Terminal C
cd dimos/web/slamass-app && npm install && npm run dev
```

Open **http://localhost:3001/** — in dev mode the app calls the API at **http://127.0.0.1:7780** directly (CORS is enabled on the sidecar). Override with `VITE_SLAMASS_API` if the sidecar uses another origin.

Production-style single port: build the UI (`npm run build`) and open only **http://localhost:7780** (the sidecar serves `dist/`).

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
export OPENAI_API_KEY=...   # optional; see Sim section
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
9. Let the robot look at a stable whitelisted object for a few seconds. A small YOLO object marker should promote onto the map.
10. Click the YOLO object marker. The detail modal should open with the best crop and stored best-view pose.
11. Press `Go To` on the YOLO object. The robot should return to the saved viewing pose for that object.
12. Press `Save Map`.
13. Switch the dashboard to `Trio`, open the `Agent` tab, and ask something like `where is the window?`
14. The agent should answer and also manipulate the map UI, for example by focusing or highlighting the relevant semantic item.
15. Ask `go to the window` and confirm the robot starts navigating to the saved viewpoint pose.
16. Ask `hide YOLO and save the map` and confirm the YOLO layer toggles off and the map checkpoints successfully.

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
- existing YOLO objects reappear
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
- YOLO objects are promoted only after repeated hits and are stored separately from VLM POIs.
- `person` is intentionally excluded from the default YOLO persistent whitelist.

## If Something Looks Broken

If the browser loads but the map never fills:

```bash
dimos status
dimos log -n 100
```

If the service starts but says it cannot connect to the websocket map source:

- the Go2 runtime is not up yet, or
- `:7779` is not serving the websocket visualization stack

If the POV never appears or stays on a placeholder:

```bash
dimos status
dimos mcp list-tools
```

- If `dimos status` says **no running instance**, the robot stack exited; check `dimos log -n 80` and restart `unitree-go2-slamass-mcp`.
- `observe` should be listed. If it is missing, the wrong blueprint is running (use **`unitree-go2-slamass-mcp`**).
- The sidecar primes a POV frame at startup and polls MCP on a timeout; **`http://localhost:3001`** dev mode must reach **`dimos-slamass`** on **7780** (see *Dev UI on port 3001* above).

A dark grey tile means MCP/`observe` is up but the camera pipeline has not produced a frame yet; live video replaces it once frames flow.
