import type { AppState } from "./types";

/**
 * Navigator API origin in dev. Vite serves the UI on :3001 while `dimos-slamass` listens on
 * :7780; same-origin relative `/api` + EventSource would hit the Vite dev server, where SSE
 * proxying is unreliable. Override with `VITE_SLAMASS_API` if your API is elsewhere.
 */
export function apiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!import.meta.env.DEV) {
    return p;
  }
  const fromEnv = (import.meta.env.VITE_SLAMASS_API as string | undefined)?.trim();
  const origin = (fromEnv || "http://127.0.0.1:7780").replace(/\/$/, "");
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
