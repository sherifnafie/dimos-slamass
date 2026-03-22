import React from "react";

import { NavigatorDashboardView } from "./navigator/NavigatorDashboardView";
import { useNavigatorSlamassState } from "./navigator/useNavigatorSlamassState";
import { PolarisLayout } from "./PolarisLayout";

/** Polaris route: Navigator dashboard with shared Polaris chrome (header + shell) like Operators. */
export default function PolarisNavigatorPage(): React.ReactElement {
  const dashboard = useNavigatorSlamassState();

  return (
    <PolarisLayout
      headerAside={
        <a
          className="polaris-operators-add-button"
          data-testid="polaris-header-create-operator"
          href="/polaris/create"
        >
          Create Operator
        </a>
      }
      shellBg="white"
    >
      <NavigatorDashboardView {...dashboard} />
    </PolarisLayout>
  );
}
