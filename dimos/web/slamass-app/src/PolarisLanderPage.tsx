import React from "react";

import polarisLanderOperatorsPreview from "./assets/polaris-lander-operators-preview.jpg";
import { PolarisLayout } from "./PolarisLayout";

/** Static landing at `/polaris` — hero with copy and product preview. */
export default function PolarisLanderPage(): React.ReactElement {
  return (
    <PolarisLayout shellBg="white">
      <main
        className="polaris-lander-main min-h-[calc(100vh-7rem)]"
        data-testid="polaris-lander"
      >
        <section className="overflow-hidden bg-white pb-20 lg:pb-28">
          <div className="polaris-lander-hero-shell relative mx-auto max-w-[min(100%,90rem)] py-16 lg:py-24">
            <div className="polaris-fade-stagger polaris-lander-hero-grid grid grid-cols-1 items-start gap-10 sm:gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.4fr)] lg:items-center lg:gap-12 xl:gap-16">
              <div className="polaris-lander-hero-copy relative z-10 text-left">
                <h1 className="polaris-lander-title" data-testid="polaris-lander-intro">
                  The intelligent OS{" "}
                  <br />
                  for the physical world.
                </h1>
                <p className="polaris-lander-tagline" data-testid="polaris-lander-tagline">
                  Polaris builds and deploys autonomous spatial intelligence on the Unitree robot ecosystem,
                  giving machines the ability to perceive, remember, and reason about the environments they
                  operate in.
                </p>
                <a className="polaris-operators-add-button polaris-lander-explore-button" href="/polaris/navigator">
                  <span aria-hidden className="polaris-lander-explore-star">
                    ✶
                  </span>
                  Explore Polaris
                </a>
              </div>

              <div
                className="polaris-lander-preview-rail polaris-lander-preview-rail--hero-split w-full min-w-0 lg:justify-self-stretch"
                data-testid="polaris-lander-preview"
              >
                <div className="polaris-lander-preview-perspective polaris-lander-preview-perspective--hero-split">
                  <div className="polaris-lander-preview-rotate">
                    <div className="polaris-lander-preview-skew">
                      <img
                        alt="Polaris operators — robot fleet overview"
                        className="polaris-lander-preview-img relative z-[2] h-auto w-full rounded-xl border border-slate-200 object-cover object-top lg:h-full"
                        decoding="async"
                        height={532}
                        src={polarisLanderOperatorsPreview}
                        width={1024}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PolarisLayout>
  );
}
