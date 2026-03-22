import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import PolarisConfiguratorPage from "./PolarisConfiguratorPage";
import PolarisLanderPage from "./PolarisLanderPage";
import PolarisPage from "./PolarisPage";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

function normalizePathname(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

type PolarisEntry = "none" | "lander" | "operators" | "configurator";

function getPolarisEntry(): PolarisEntry {
  const path = normalizePathname();
  if (path === "/polaris/operators") {
    return "operators";
  }
  if (path === "/polaris/configurator") {
    return "configurator";
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
    ) : polarisEntry === "configurator" ? (
      <PolarisConfiguratorPage />
    ) : polarisEntry === "lander" ? (
      <PolarisLanderPage />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
