import React from "react";
import { SignalIcon as SignalOutline } from "@heroicons/react/24/outline";
import { SignalIcon as SignalSolid } from "@heroicons/react/24/solid";

/** Navigator map header — teleop arm / link (outline → solid on hover). */
export function TeleopGlyphs(): React.ReactElement {
  return (
    <span className="settings-cog-icon-stack" aria-hidden>
      <SignalOutline className="settings-cog-icon settings-cog-icon--outline" />
      <SignalSolid className="settings-cog-icon settings-cog-icon--solid" />
    </span>
  );
}
