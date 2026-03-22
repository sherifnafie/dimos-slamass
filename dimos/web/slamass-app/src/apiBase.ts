import type { AppState } from "./types";

/** Prefix with Vite `BASE_URL` when the app is served under a subpath (dev or build). */
function withViteBase(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  if (!base) {
    return p;
  }
  return `${base}${p}`;
}

/**
 * Navigator API URL in dev.
 *
 * **Default:** same-origin relative paths (`/api/...`) so requests go through Vite’s `server.proxy`
 * to `dimos-slamass` on :7780. That keeps `fetch`, `EventSource`, and `<img src="/api/...">` on one
 * origin (e.g. `http://localhost:3001`) and avoids cross-origin issues between `localhost` and
 * `127.0.0.1` or CORS edge cases.
 *
 * **Override:** set `VITE_SLAMASS_API` to a full origin (e.g. `http://127.0.0.1:7780`) when the UI
 * is not served by Vite or the API runs on another host.
 */
export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!import.meta.env.DEV) {
    return withViteBase(p);
  }
  const fromEnv = (import.meta.env.VITE_SLAMASS_API as string | undefined)?.trim();
  if (!fromEnv) {
    return withViteBase(p);
  }
  const origin = fromEnv.replace(/\/$/, "");
  return `${origin}${p}`;
}

function fixDevAssetUrl(url: string): string {
  if (!import.meta.env.DEV || !url.startsWith("/api")) {
    return url;
  }
  return apiUrl(url);
}

/** Rewrite `/api/...` asset URLs so images load from the Navigator API origin in dev. */
export function normalizeAppStateForDev(state: AppState): AppState {
  if (!import.meta.env.DEV) {
    return state;
  }
  return {
    ...state,
    pov: {
      ...state.pov,
      image_url: fixDevAssetUrl(state.pov.image_url),
    },
    map: state.map
      ? { ...state.map, image_url: fixDevAssetUrl(state.map.image_url) }
      : null,
    pois: state.pois.map((poi) => ({
      ...poi,
      thumbnail_url: fixDevAssetUrl(poi.thumbnail_url),
      hero_image_url: fixDevAssetUrl(poi.hero_image_url),
    })),
    yolo_objects: state.yolo_objects.map((y) => ({
      ...y,
      thumbnail_url: fixDevAssetUrl(y.thumbnail_url),
      hero_image_url: fixDevAssetUrl(y.hero_image_url),
    })),
  };
}
