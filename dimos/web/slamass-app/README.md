# SLAMASS Web App

This is the React + Vite operator dashboard for SLAMASS.

The UI is intentionally opinionated around the demo workflow:

- live first-person POV on the left
- persistent semantic map on the right
- operator rail for selection, semantic detail, controls, and chat
- click-to-nav, `Inspect Now`, layer toggles, and semantic item actions
- activity toasts for navigation, inspection, and agent-triggered actions

## Key Files

- [`src/App.tsx`](src/App.tsx): top-level state orchestration, SSE subscription, operator actions
- [`src/MapPane.tsx`](src/MapPane.tsx): map rendering, viewport control, semantic overlays, click interactions
- [`src/LiveFeedPanel.tsx`](src/LiveFeedPanel.tsx): POV panel
- [`src/OperatorRail.tsx`](src/OperatorRail.tsx): semantic selection and control surface
- [`src/ChatPanel.tsx`](src/ChatPanel.tsx): chat UI for the service-owned agent
- [`src/semanticItems.ts`](src/semanticItems.ts): merge and selection helpers for POIs and YOLO objects
- [`src/types.ts`](src/types.ts): frontend contract with the service API

## Development

Install dependencies once:

```bash
cd dimos/web/slamass-app
npm ci
```

Type-check the app:

```bash
npm run typecheck
```

Build the production bundle that `dimos-slamass` serves:

```bash
npm run build
```

Run the Vite dev server on `http://localhost:3001`:

```bash
npm run dev
```

The Vite config proxies `/api` to `http://localhost:7780`, so the normal workflow is:

1. run `dimos-slamass`
2. run `npm run dev`
3. open `http://localhost:3001`

## Runtime Model

The frontend expects the backend to provide:

- an initial snapshot via REST
- live updates via `EventSource` on `/api/events`
- image endpoints for the latest POV frame and current map preview
- mutation endpoints for navigation, inspection, chat, and semantic item actions

The UI does not talk to MCP directly. All robot-facing behavior stays in the SLAMASS service.

## Related Code

- [`../../slamass/README.md`](../../slamass/README.md)
- [`../../slamass/service.py`](../../slamass/service.py)
