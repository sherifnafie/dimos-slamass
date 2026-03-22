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
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

type PolarisEntry = "none" | "lander" | "operators" | "navigator" | "create";

function getPolarisEntry(): PolarisEntry {
  const path = normalizePathname();
  if (path === "/polaris/operators" || path === "/operators") {
    return "operators";
  }
  if (path === "/polaris/navigator" || path === "/polaris/configurator") {
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
