import type { UiState } from "./types";

/**
 * Merge server `UiState` into the previous snapshot. When `preserveCamera` is true, keep the
 * client's camera (panned/zoomed view) so `/api/ui/select-item` cannot snap the map back to a
 * stale server camera while a debounced `/api/ui/camera` PUT is still pending.
 */
export function mergeUiPreferringLocalCamera(
  previous: UiState,
  next: UiState,
  preserveCamera: boolean,
): UiState {
  if (next.revision < previous.revision) {
    return previous;
  }
  if (!preserveCamera) {
    return next;
  }
  return { ...next, camera: previous.camera };
}
