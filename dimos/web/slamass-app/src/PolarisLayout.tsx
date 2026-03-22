import React, { useState } from "react";

import { PolarisSidebars } from "./PolarisSidebar";
import "./polaris.css";

export type PolarisLayoutProps = {
  children: React.ReactNode;
  /** Default tinted shell (`slate`); lander uses `white` for a flat background. */
  shellBg?: "slate" | "white";
  /** Optional right side of the primary header row (e.g. Navigator status line). */
  headerAside?: React.ReactNode;
};

/** Shared shell: glass menu + primary header (hamburger + title). */
export function PolarisLayout({
  children,
  shellBg = "slate",
  headerAside,
}: PolarisLayoutProps): React.ReactElement {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const shellBgClass = shellBg === "white" ? "bg-white" : "bg-slate-50";

  return (
    <div
      className={`polaris-root polaris-root--shell flex min-h-0 flex-col ${shellBgClass} font-[Helvetica,Arial,sans-serif] text-slate-900 antialiased`}
    >
      <PolarisSidebars onOpenChange={setSidebarOpen} open={sidebarOpen} />
      <header className="polaris-header sticky top-0 z-10 shrink-0 bg-white">
        <nav
          aria-label="Primary"
          className="relative flex h-28 w-full items-center justify-between gap-4 overflow-visible px-4 sm:px-6"
        >
          <div className="polaris-header-brand flex items-center gap-3 sm:gap-4">
            <button
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              className="polaris-menu-button"
              data-testid="polaris-menu-button"
              onClick={() => setSidebarOpen((open) => !open)}
              type="button"
            >
              {sidebarOpen ? (
                <span className="polaris-menu-star" aria-hidden="true">
                  ✶
                </span>
              ) : (
                <span className="polaris-menu-icon" aria-hidden="true">
                  <span className="polaris-menu-bar" />
                  <span className="polaris-menu-bar" />
                  <span className="polaris-menu-bar" />
                </span>
              )}
            </button>
            <a className="polaris-title" data-testid="polaris-nav-title" href="/polaris">
              Polaris
            </a>
          </div>
          {headerAside != null ? (
            <div className="polaris-header-aside">{headerAside}</div>
          ) : null}
        </nav>
      </header>
      {children}
    </div>
  );
}
