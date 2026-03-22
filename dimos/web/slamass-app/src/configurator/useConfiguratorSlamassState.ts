import React, { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { apiUrl, normalizeAppStateForDev } from "../apiBase";
import { mergePoi, mergeYoloObject } from "../semanticItems";
import type {
  AppState,
  ChatState,
  InspectionState,
  Poi,
  SemanticItemRef,
  UiCameraState,
  UiState,
  YoloObject,
} from "../types";
import { fetchJson } from "./fetchJson";

const emptyState: AppState = {
  connected: false,
  robot_pose: null,
  path: [],
  pov: {
    available: false,
    seq: 0,
    updated_at: null,
    image_url: apiUrl("/api/pov/latest.jpg?v=0"),
  },
  map: null,
  pois: [],
  yolo_objects: [],
  inspection: {
    status: "idle",
    message: "",
    poi_id: null,
  },
  inspection_settings: {
    manual_mode: "ai_gate",
  },
  yolo_runtime: {
    mode: "live",
    inference_enabled: true,
  },
  layers: {
    show_pois: true,
    show_yolo: true,
  },
  ui: {
    revision: 0,
    camera: {
      center_x: null,
      center_y: null,
      zoom: 1,
    },
    selected_item: null,
    highlighted_items: [],
  },
  chat: {
    running: false,
    messages: [],
  },
};

function applyUiState(previous: UiState, next: UiState): UiState {
  return next.revision >= previous.revision ? next : previous;
}

export function useConfiguratorSlamassState(): {
  state: AppState;
  queueCameraSync: (camera: UiCameraState) => void;
  handleSelectItem: (item: SemanticItemRef | null) => void;
  handleFocusItem: (item: SemanticItemRef) => void;
  handleFocusMap: () => void;
  handleFocusRobot: () => void;
  handleClearFocus: () => void;
} {
  const [state, setState] = useState<AppState>(emptyState);
  const cameraSyncTimerRef = useRef<number | null>(null);

  const mergeUiState = useCallback((nextUi: UiState) => {
    if (cameraSyncTimerRef.current !== null) {
      window.clearTimeout(cameraSyncTimerRef.current);
      cameraSyncTimerRef.current = null;
    }
    startTransition(() => {
      setState((previous) => ({
        ...previous,
        ui: applyUiState(previous.ui, nextUi),
      }));
    });
  }, []);

  const issueUiCommand = useCallback(
    async (url: string, init?: RequestInit): Promise<UiState> => {
      const nextUi = await fetchJson<UiState>(url, init);
      mergeUiState(nextUi);
      return nextUi;
    },
    [mergeUiState],
  );

  const queueCameraSync = useCallback(
    (camera: UiCameraState) => {
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          ui: {
            ...previous.ui,
            camera,
          },
        }));
      });

      if (cameraSyncTimerRef.current !== null) {
        window.clearTimeout(cameraSyncTimerRef.current);
      }
      cameraSyncTimerRef.current = window.setTimeout(() => {
        void issueUiCommand("/api/ui/camera", {
          method: "PUT",
          body: JSON.stringify(camera),
        });
        cameraSyncTimerRef.current = null;
      }, 140);
    },
    [issueUiCommand],
  );

  useEffect(() => {
    let cancelled = false;

    const loadState = async (): Promise<void> => {
      try {
        const data = await fetchJson<AppState>("/api/state");
        if (!cancelled) {
          startTransition(() => {
            setState(normalizeAppStateForDev(data));
          });
        }
      } catch {
        /* keep emptyState */
      }
    };

    void loadState();

    const source = new EventSource(apiUrl("/api/events"));

    const onStateUpdated = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as Partial<AppState>;
      startTransition(() => {
        setState((previous) =>
          normalizeAppStateForDev({
            ...previous,
            ...payload,
            pov: payload.pov ? { ...previous.pov, ...payload.pov } : previous.pov,
            yolo_runtime: payload.yolo_runtime ?? previous.yolo_runtime,
            layers: payload.layers ?? previous.layers,
            inspection_settings: payload.inspection_settings ?? previous.inspection_settings,
          }),
        );
      });
    };

    const onMapUpdated = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as AppState["map"];
      startTransition(() => {
        setState((previous) => normalizeAppStateForDev({ ...previous, map: payload }));
      });
    };

    const onPoiUpserted = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as Poi;
      startTransition(() => {
        setState((previous) =>
          normalizeAppStateForDev({
            ...previous,
            pois: mergePoi(previous.pois, payload),
          }),
        );
      });
    };

    const onPoiDeleted = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as { poi_id: string };
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          pois: previous.pois.filter((poi) => poi.poi_id !== payload.poi_id),
        }));
      });
    };

    const onYoloUpserted = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as YoloObject;
      startTransition(() => {
        setState((previous) =>
          normalizeAppStateForDev({
            ...previous,
            yolo_objects: mergeYoloObject(previous.yolo_objects, payload),
          }),
        );
      });
    };

    const onYoloDeleted = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as { object_id: string };
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          yolo_objects: previous.yolo_objects.filter(
            (object) => object.object_id !== payload.object_id,
          ),
        }));
      });
    };

    const onInspectionUpdated = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as InspectionState;
      startTransition(() => {
        setState((previous) => ({ ...previous, inspection: payload }));
      });
    };

    const onChatUpdated = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as ChatState;
      startTransition(() => {
        setState((previous) => ({ ...previous, chat: payload }));
      });
    };

    const onUiUpdated = (event: MessageEvent): void => {
      const payload = JSON.parse(event.data as string) as UiState;
      mergeUiState(payload);
    };

    source.addEventListener("state_updated", onStateUpdated);
    source.addEventListener("map_updated", onMapUpdated);
    source.addEventListener("poi_upserted", onPoiUpserted);
    source.addEventListener("poi_deleted", onPoiDeleted);
    source.addEventListener("yolo_object_upserted", onYoloUpserted);
    source.addEventListener("yolo_object_deleted", onYoloDeleted);
    source.addEventListener("inspection_updated", onInspectionUpdated);
    source.addEventListener("chat_state_updated", onChatUpdated);
    source.addEventListener("ui_state_updated", onUiUpdated);

    return () => {
      cancelled = true;
      source.removeEventListener("state_updated", onStateUpdated);
      source.removeEventListener("map_updated", onMapUpdated);
      source.removeEventListener("poi_upserted", onPoiUpserted);
      source.removeEventListener("poi_deleted", onPoiDeleted);
      source.removeEventListener("yolo_object_upserted", onYoloUpserted);
      source.removeEventListener("yolo_object_deleted", onYoloDeleted);
      source.removeEventListener("inspection_updated", onInspectionUpdated);
      source.removeEventListener("chat_state_updated", onChatUpdated);
      source.removeEventListener("ui_state_updated", onUiUpdated);
      source.close();
      if (cameraSyncTimerRef.current !== null) {
        window.clearTimeout(cameraSyncTimerRef.current);
      }
    };
  }, [mergeUiState]);

  const handleSelectItem = useCallback(
    (item: SemanticItemRef | null) => {
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          ui: {
            ...previous.ui,
            selected_item: item,
          },
        }));
      });
      void issueUiCommand("/api/ui/select-item", {
        method: "POST",
        body: JSON.stringify({
          kind: item?.kind ?? null,
          entity_id: item?.entity_id ?? null,
        }),
      });
    },
    [issueUiCommand],
  );

  const handleFocusItem = useCallback(
    (item: SemanticItemRef) => {
      void issueUiCommand(`/api/ui/focus-item/${item.kind}/${item.entity_id}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    [issueUiCommand],
  );

  const handleFocusMap = useCallback(() => {
    void issueUiCommand("/api/ui/focus-map", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }, [issueUiCommand]);

  const handleFocusRobot = useCallback(() => {
    void issueUiCommand("/api/ui/focus-robot", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }, [issueUiCommand]);

  const handleClearFocus = useCallback(() => {
    void issueUiCommand("/api/ui/clear-focus", {
      method: "POST",
      body: JSON.stringify({}),
    });
  }, [issueUiCommand]);

  return {
    state,
    queueCameraSync,
    handleSelectItem,
    handleFocusItem,
    handleFocusMap,
    handleFocusRobot,
    handleClearFocus,
  };
}
