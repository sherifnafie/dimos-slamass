import React from "react";

import { NavigatorDashboardView } from "./navigator/NavigatorDashboardView";
import { useNavigatorSlamassState } from "./navigator/useNavigatorSlamassState";

/** Polaris route: same SLAMASS dashboard shell/workspace as `/` (:3001), light theme; Operators link in header. */
export default function PolarisNavigatorPage(): React.ReactElement {
  const dashboard = useNavigatorSlamassState();
  return <NavigatorDashboardView {...dashboard} />;
}
