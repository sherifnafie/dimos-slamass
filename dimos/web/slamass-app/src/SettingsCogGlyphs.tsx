import React from "react";
import { Cog6ToothIcon as Cog6ToothOutline } from "@heroicons/react/24/outline";
import { Cog6ToothIcon as Cog6ToothSolid } from "@heroicons/react/24/solid";

/** Outline default; solid on button :hover / :focus-visible (see `.settings-cog-icon-*` in styles.css). */
export function SettingsCogGlyphs(): React.ReactElement {
  return (
    <span className="settings-cog-icon-stack" aria-hidden>
      <Cog6ToothOutline className="settings-cog-icon settings-cog-icon--outline" />
      <Cog6ToothSolid className="settings-cog-icon settings-cog-icon--solid" />
    </span>
  );
}
