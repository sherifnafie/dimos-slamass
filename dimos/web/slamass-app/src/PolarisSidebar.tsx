import React from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from "@headlessui/react";
import { MapIcon } from "@heroicons/react/24/outline";

import { POLARIS_SIDEBAR_OPERATORS_IMAGE_URL } from "./polarisAssets";

function normalizePathname(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function pathIsNavigator(path: string): boolean {
  return (
    path === "/polaris/navigator" ||
    path === "/navigator" ||
    path === "/polaris/configurator" ||
    path === "/configurator"
  );
}

function pathIsOperators(path: string): boolean {
  return path === "/polaris/operators" || path === "/operators";
}

function PolarisSidebarNav(): React.ReactElement {
  const path = normalizePathname();
  const onNavigator = pathIsNavigator(path);
  const onOperators = pathIsOperators(path);

  return (
    <nav aria-label="Sidebar" className="polaris-sidebar-nav">
      <div className="polaris-sidebar-nav-brand">Polaris</div>
      <ul className="polaris-sidebar-nav-list" role="list">
        <li>
          <a
            className={`polaris-sidebar-nav-link${onNavigator ? " polaris-sidebar-nav-link--active" : ""}`}
            data-testid="polaris-sidebar-navigator"
            href="/polaris/navigator"
          >
            <MapIcon aria-hidden="true" className="polaris-sidebar-nav-icon" />
            <span>Navigator</span>
          </a>
        </li>
        <li>
          <a
            className={`polaris-sidebar-nav-link polaris-sidebar-nav-link--operators${
              onOperators ? " polaris-sidebar-nav-link--active" : ""
            }`}
            data-testid="polaris-sidebar-operators"
            href="/polaris/operators"
          >
            <span className="polaris-sidebar-nav-link-text">Operators</span>
            <img
              alt=""
              className="polaris-sidebar-nav-operators-img"
              decoding="async"
              height={72}
              referrerPolicy="no-referrer"
              src={POLARIS_SIDEBAR_OPERATORS_IMAGE_URL}
              width={72}
            />
          </a>
        </li>
      </ul>
    </nav>
  );
}

export type PolarisSidebarsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PolarisSidebars({
  open,
  onOpenChange,
}: PolarisSidebarsProps): React.ReactElement {
  return (
    <Dialog
      className="relative z-50"
      onClose={onOpenChange}
      open={open}
      transition
    >
      <DialogBackdrop className="polaris-sidebar-backdrop" transition />

      <div className="fixed inset-0 flex">
        <DialogPanel className="polaris-sidebar-panel-shell" transition>
          <TransitionChild transition>
            <div className="polaris-sidebar-close-slot">
              <button
                className="polaris-sidebar-close"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                <span className="sr-only">Close sidebar</span>
                <span aria-hidden="true" className="polaris-sidebar-close-glyph">
                  ✶
                </span>
              </button>
            </div>
          </TransitionChild>

          <div className="polaris-sidebar-panel polaris-sidebar-panel--operators-nav">
            <PolarisSidebarNav />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
