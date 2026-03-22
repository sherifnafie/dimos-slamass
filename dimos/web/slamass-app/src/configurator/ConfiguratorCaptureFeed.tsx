import React, { useEffect, useRef, useState } from "react";

import type { AppState } from "../types";

type CaptureEntry = {
  key: string;
  src: string;
  seq: number;
  caption: string;
};

const MAX_ENTRIES = 48;

/** Pinned first row — reference imagery for the capture feed (Unitree product shot). */
const PLACEHOLDER_CAPTURE: CaptureEntry = {
  key: "placeholder-unitree-go2",
  src: "https://www.unitree.com/images/9896d21bdef4443d821a324931d8af0c_800x800.png",
  seq: -1,
  caption: "Reference",
};

function formatCaptureTime(value: string | null): string {
  if (!value) {
    return "Live frame";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function ConfiguratorCaptureFeed(props: { state: AppState }): React.ReactElement {
  const { state } = props;
  const [entries, setEntries] = useState<CaptureEntry[]>([]);
  const lastSeqRef = useRef<number | null>(null);

  useEffect(() => {
    const pov = state.pov;
    if (!pov.available) {
      return;
    }
    const seq = pov.seq;
    if (lastSeqRef.current === seq) {
      return;
    }
    lastSeqRef.current = seq;
    const key = `${seq}-${pov.updated_at ?? ""}-${pov.image_url}`;
    setEntries((prev) => {
      if (prev[0]?.key === key) {
        return prev;
      }
      const next: CaptureEntry = {
        key,
        src: pov.image_url,
        seq,
        caption: formatCaptureTime(pov.updated_at),
      };
      return [next, ...prev].slice(0, MAX_ENTRIES);
    });
  }, [state.pov]);

  const displayEntries = [PLACEHOLDER_CAPTURE, ...entries];

  return (
    <div className="polaris-configurator-feed">
      <div className="polaris-configurator-feed-head">
        <p className="polaris-configurator-feed-kicker">Robot camera</p>
        <h2 className="polaris-configurator-feed-title">Capture feed</h2>
        <p className="polaris-configurator-feed-sub">
          {state.pov.available
            ? "New frames appear as the stream updates."
            : "Waiting for POV imagery from the robot stack."}
        </p>
      </div>
      <div
        aria-label="Robot capture history"
        className="polaris-configurator-feed-scroll"
        role="region"
      >
        {entries.length === 0 ? (
          <div className="polaris-configurator-feed-empty">
            <p>No live frames yet.</p>
            <p className="polaris-configurator-feed-empty-hint">
              Connect SLAMASS and start the perception pipeline to populate this list below the
              reference image.
            </p>
          </div>
        ) : null}
        <ul className="polaris-configurator-feed-list" role="list">
          {displayEntries.map((entry) => (
            <li className="polaris-configurator-feed-item" key={entry.key} role="listitem">
              <figure className="polaris-configurator-feed-card">
                <div className="polaris-configurator-feed-frame">
                  <img
                    alt={
                      entry.seq < 0
                        ? "Unitree Go2 reference product image"
                        : `Robot view seq ${entry.seq}`
                    }
                    className="polaris-configurator-feed-img"
                    decoding="async"
                    loading="lazy"
                    src={entry.src}
                  />
                </div>
                <figcaption className="polaris-configurator-feed-caption">
                  <span className="polaris-configurator-feed-caption-seq">
                    {entry.seq < 0 ? "REF" : `#${entry.seq}`}
                  </span>
                  <span className="polaris-configurator-feed-caption-time">{entry.caption}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
