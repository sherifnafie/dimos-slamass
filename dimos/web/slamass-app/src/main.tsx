import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import PolarisNavigatorPage from "./PolarisNavigatorPage";
import PolarisCreateOperatorPage from "./PolarisCreateOperatorPage";
import PolarisLanderPage from "./PolarisLanderPage";
import PolarisPage from "./PolarisPage";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

function normalizePathname(): string {
  let path = window.location.pathname.replace(/\/+/g, "/");
  const base = import.meta.env.BASE_URL;
  if (base && base !== "/") {
    const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
    if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
      path = path.slice(prefix.length);
    }
  }
  path = path.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

type PolarisEntry = "none" | "lander" | "operators" | "navigator" | "create";

/** Pathnames that mount Polaris shells (short aliases mirror `/operators`, `/create`). */
function getPolarisEntry(): PolarisEntry {
  const path = normalizePathname();
  if (path === "/polaris/operators" || path === "/operators") {
    return "operators";
  }
  if (
    path === "/polaris/navigator" ||
    path === "/polaris/configurator" ||
    path === "/navigator" ||
    path === "/configurator"
  ) {
    return "navigator";
  }
  if (path === "/polaris/create" || path === "/create") {
    return "create";
  }
  if (path === "/polaris") {
    return "lander";
  }
  return "none";
}

const polarisEntry = getPolarisEntry();

createRoot(container).render(
  <React.StrictMode>
    {polarisEntry === "operators" ? (
      <PolarisPage />
    ) : polarisEntry === "navigator" ? (
      <PolarisNavigatorPage />
    ) : polarisEntry === "create" ? (
      <PolarisCreateOperatorPage />
    ) : polarisEntry === "lander" ? (
      <PolarisLanderPage />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
