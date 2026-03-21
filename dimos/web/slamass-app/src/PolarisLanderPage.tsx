import React from "react";

import { PolarisLayout } from "./PolarisLayout";

/** Static landing at `/polaris` — navbar + minimal body; operators live at `/polaris/operators`. */
export default function PolarisLanderPage(): React.ReactElement {
  return (
    <PolarisLayout>
      <main
        className="polaris-lander-main min-h-[calc(100vh-7rem)] bg-slate-50 px-4 py-16 sm:px-6"
        data-testid="polaris-lander"
      >
        <div className="polaris-lander-inner mx-auto max-w-lg text-center">
          <p className="polaris-lander-kicker">Dimensional stack</p>
          <h1 className="polaris-lander-title">Polaris</h1>
          <p className="polaris-lander-lede">
            Robot supervision and SLAMASS views live under{" "}
            <span className="polaris-lander-mono">/polaris/operators</span>.
          </p>
          <a className="polaris-lander-cta" href="/polaris/operators">
            Open operators
          </a>
        </div>
      </main>
    </PolarisLayout>
  );
}
