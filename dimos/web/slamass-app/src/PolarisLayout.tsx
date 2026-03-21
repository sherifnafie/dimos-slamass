import React, { useState } from "react";

import { PolarisSidebars } from "./PolarisSidebar";
import "./polaris.css";

export type PolarisLayoutProps = {
  children: React.ReactNode;
};

/** Shared shell: glass menu + primary header (hamburger + title). */
export function PolarisLayout({ children }: PolarisLayoutProps): React.ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="polaris-root min-h-screen bg-slate-50 font-[Helvetica,Arial,sans-serif] text-slate-900 antialiased">
      <PolarisSidebars onOpenChange={setSidebarOpen} open={sidebarOpen} />
      <header className="polaris-header sticky top-0 z-10 bg-white">
        <nav
          aria-label="Primary"
          className="relative flex h-28 w-full items-center justify-center overflow-visible px-4 sm:px-6"
        >
          <button
            aria-expanded={sidebarOpen}
            aria-label="Open menu"
            className="polaris-menu-button"
            data-testid="polaris-menu-button"
            onClick={() => setSidebarOpen((open) => !open)}
            type="button"
          >
            <span className="polaris-menu-icon" aria-hidden="true">
              <span className="polaris-menu-bar" />
              <span className="polaris-menu-bar" />
              <span className="polaris-menu-bar" />
            </span>
          </button>
          <span className="polaris-title" data-testid="polaris-nav-title">
            Polaris
          </span>
        </nav>
      </header>
      {children}
    </div>
  );
}
