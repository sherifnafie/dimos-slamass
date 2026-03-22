import React from "react";
import { MagnifyingGlassIcon as MagnifyingGlassOutline } from "@heroicons/react/24/outline";
import { MagnifyingGlassIcon as MagnifyingGlassSolid } from "@heroicons/react/24/solid";

/** Navigator map header — outline → solid on hover (same stack as `SaveMapGlyphs`). */
export function InspectGlyphs(): React.ReactElement {
  return (
    <span className="settings-cog-icon-stack" aria-hidden>
      <MagnifyingGlassOutline className="settings-cog-icon settings-cog-icon--outline" />
      <MagnifyingGlassSolid className="settings-cog-icon settings-cog-icon--solid" />
    </span>
  );
}
