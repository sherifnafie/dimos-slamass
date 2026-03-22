import React from "react";
import { StopIcon as StopOutline } from "@heroicons/react/24/outline";
import { StopIcon as StopSolid } from "@heroicons/react/24/solid";

/**
 * Stop / kill stack — same pattern as `SaveMapGlyphs` / `SettingsCogGlyphs` for
 * outline → solid on hover (`.settings-cog-icon-*` in `styles.css` / `polaris.css`).
 */
export function StopStackGlyphs(): React.ReactElement {
  return (
    <span className="settings-cog-icon-stack" aria-hidden>
      <StopOutline className="settings-cog-icon settings-cog-icon--outline" />
      <StopSolid className="settings-cog-icon settings-cog-icon--solid" />
    </span>
  );
}
