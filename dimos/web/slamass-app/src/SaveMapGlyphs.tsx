import React from "react";
import { ArrowDownTrayIcon as ArrowDownTrayOutline } from "@heroicons/react/24/outline";
import { ArrowDownTrayIcon as ArrowDownTraySolid } from "@heroicons/react/24/solid";

/**
 * Save / checkpoint map — same stack + classes as `SettingsCogGlyphs` so
 * `.settings-cog-button` hover styles apply (see `styles.css`).
 */
export function SaveMapGlyphs(): React.ReactElement {
  return (
    <span className="settings-cog-icon-stack" aria-hidden>
      <ArrowDownTrayOutline className="settings-cog-icon settings-cog-icon--outline" />
      <ArrowDownTraySolid className="settings-cog-icon settings-cog-icon--solid" />
    </span>
  );
}
