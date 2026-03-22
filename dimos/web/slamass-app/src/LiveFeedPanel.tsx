import { CameraIcon } from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { apiUrl } from "./apiBase";
import { PanelShell } from "./PanelShell";
import { PovState } from "./types";

type LiveFeedPanelProps = {
  connected: boolean;
  pov: PovState;
  poseLabel: string | null;
  frameLabel: string;
  /**
   * When true, render only the POV stage (no `PanelShell`).
   * Use inside `NavigatorOptionCard` with chips in the card header.
   */
  embedded?: boolean;
};

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** Sends the JPEG to slamass so it becomes a POI and appears in Detections (SSE `poi_upserted`). */
async function postPovSnapshotToDetections(blob: Blob): Promise<void> {
  const form = new FormData();
  form.append("file", blob, "pov-snapshot.jpg");
  const response = await fetch(apiUrl("/api/pov/snapshot/ingest"), {
    method: "POST",
    body: form,
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
}

function deliverSnapshot(blob: Blob): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  triggerDownload(blob, `robot-pov-${stamp}.jpg`);
  void postPovSnapshotToDetections(blob).catch((err: unknown) => {
    console.warn("[LiveFeedPanel] Could not add snapshot to Detections:", err);
  });
}

export function LiveFeedPanel(props: LiveFeedPanelProps): React.ReactElement {
  const { connected, pov, poseLabel, frameLabel, embedded = false } = props;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    setImgReady(false);
  }, [pov.image_url]);

  const handleCapture = useCallback(() => {
    const img = imgRef.current;
    if (!img || !pov.available || img.naturalWidth < 1) {
      return;
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch {
      void fetch(pov.image_url, { credentials: "include", mode: "cors" })
        .then((r) => r.blob())
        .then((blob) => {
          deliverSnapshot(blob);
        })
        .catch(() => {
          window.open(pov.image_url, "_blank", "noopener,noreferrer");
        });
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        deliverSnapshot(blob);
      },
      "image/jpeg",
      0.92,
    );
  }, [pov.available, pov.image_url]);

  const canCapture = pov.available && imgReady;

  const stage = (
    <div className="pov-stage polaris-nav-pov-stage">
      <img
        ref={imgRef}
        alt="Robot POV"
        className="pov-image"
        decoding="async"
        onLoad={() => setImgReady(true)}
        onError={() => setImgReady(false)}
        src={pov.image_url}
      />
      {!pov.available && !embedded ? (
        <p className="pov-feed-sentence" role="status">
          Waiting for camera feed…
        </p>
      ) : null}
      <button
        aria-label={
          canCapture
            ? connected
              ? "Take a picture (live feed)"
              : "Take a picture"
            : "Camera feed not ready"
        }
        className="pov-capture-button"
        disabled={!canCapture}
        type="button"
        onClick={handleCapture}
      >
        <CameraIcon aria-hidden className="pov-capture-button-icon" />
      </button>
    </div>
  );

  if (embedded) {
    return stage;
  }

  return (
    <PanelShell
      aside={
        <div className="panel-chip-row">
          {poseLabel ? <span className="toolbar-chip monospace-chip">{poseLabel}</span> : null}
          <span className="toolbar-chip">{pov.available ? `Updated ${frameLabel}` : frameLabel}</span>
        </div>
      }
      bodyClassName="panel-body-stage"
      className="feed-panel"
      kicker="Live"
      title="POV"
    >
      {stage}
    </PanelShell>
  );
}
