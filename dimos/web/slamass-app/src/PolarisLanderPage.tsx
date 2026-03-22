import React from "react";

import polarisLanderOperatorsPreview from "./assets/polaris-lander-operators-preview.jpg";
import { PolarisLayout } from "./PolarisLayout";
import { POLARIS_A2_PREVIEW_URL } from "./polarisAssets";

const LANDER_ARC_COUNT = 13;
const LANDER_ARC_HALFWIDTH_PX = 252;
const LANDER_ARC_HEIGHT_PX = 112;

const LANDER_ARC_STEPS = (() => {
  const n = LANDER_ARC_COUNT;
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const angle = Math.PI * (1 - t);
    const x = Math.cos(angle) * LANDER_ARC_HALFWIDTH_PX;
    const y = Math.sin(angle) * LANDER_ARC_HEIGHT_PX;
    const fade = Math.sin(Math.PI * t);
    const apex = i === mid;
    return {
      i,
      apex,
      transform: `translate(calc(-50% + ${x.toFixed(1)}px), ${(-y).toFixed(1)}px)`,
      opacity: apex ? 1 : 0.1 + 0.78 * fade,
    };
  });
})();

/** Static landing at `/polaris` — hero + A2-style bento spec grid (layout reference: unitree.com/A2). */
export default function PolarisLanderPage(): React.ReactElement {
  return (
    <PolarisLayout shellBg="white">
      <main
        className="polaris-lander-main min-h-[calc(100vh-7rem)]"
        data-testid="polaris-lander"
      >
        {/* Hero layout matches Tailark hero-section-9: copy block, then overlapping 3D+skew preview rail */}
        <section className="overflow-hidden bg-white pb-32 lg:pb-48">
          <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="polaris-fade-stagger relative z-10 mx-auto max-w-2xl text-center">
              <div aria-hidden className="polaris-lander-arc" data-testid="polaris-lander-arc">
                {LANDER_ARC_STEPS.map((step) => (
                  <span
                    className={
                      step.apex
                        ? "polaris-lander-arc-dot polaris-lander-arc-dot--apex"
                        : "polaris-lander-arc-dot"
                    }
                    key={step.i}
                    style={{ opacity: step.opacity, transform: step.transform }}
                  >
                    {step.apex ? <span className="polaris-lander-arc-apex-glyph" /> : null}
                  </span>
                ))}
              </div>
              <h1 className="polaris-lander-title" data-testid="polaris-lander-intro">
                The operating system
                <br />
                for the physical world.
              </h1>
              <p className="polaris-lander-tagline" data-testid="polaris-lander-tagline">
                Polaris builds and deploys autonomous spatial intelligence on the Unitree robot ecosystem,
                giving machines the ability to perceive, remember, and reason about the environments they
                operate in.
              </p>
              <a className="polaris-lander-cta" href="/polaris/operators">
                Open operators
              </a>
            </div>
          </div>

          <div
            className="polaris-lander-preview-rail mt-10 ml-0 mr-auto w-full max-w-[min(100%,96rem)] pl-0 pr-4 sm:mt-12 sm:pr-6 lg:mt-14"
            data-testid="polaris-lander-preview"
          >
            <div className="polaris-lander-preview-perspective pl-2 sm:pl-4 lg:pl-8 -mr-8 lg:-mr-28">
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
        </section>

        <section
          aria-labelledby="polaris-lander-bento-heading"
          className="polaris-lander-bento"
          data-testid="polaris-lander-bento"
        >
          <div className="polaris-lander-bento-inner polaris-fade-stagger polaris-fade-stagger--bento mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6">
            <div className="polaris-lander-bento-head">
              <h2 className="polaris-lander-bento-heading" id="polaris-lander-bento-heading">
                Specification highlights
              </h2>
              <p className="polaris-lander-bento-sub">
                Bento layout inspired by{" "}
                <a
                  className="polaris-lander-bento-sub-link"
                  href="https://www.unitree.com/A2"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Unitree A2
                </a>{" "}
                — industrial quadruped reference specs.
              </p>
            </div>

            <div className="polaris-lander-bento-grid">
              <article className="polaris-lander-bento-card polaris-lander-bento-card--torque">
                <div className="polaris-lander-bento-card-copy">
                  <p className="polaris-lander-bento-label">Peak joint torque</p>
                  <p className="polaris-lander-bento-stat">Approx. 180&nbsp;N·m</p>
                </div>
                <div className="polaris-lander-bento-visual polaris-lander-bento-visual--torque">
                  <img
                    alt=""
                    className="polaris-lander-bento-img"
                    decoding="async"
                    src={POLARIS_A2_PREVIEW_URL}
                  />
                </div>
              </article>

              <article className="polaris-lander-bento-card polaris-lander-bento-card--walk">
                <div className="polaris-lander-bento-card-copy">
                  <p className="polaris-lander-bento-label">Extreme walking ability</p>
                  <p className="polaris-lander-bento-stat">Max step height 30&nbsp;cm</p>
                  <p className="polaris-lander-bento-stat polaris-lander-bento-stat--secondary">
                    Max slope angle 45°
                  </p>
                </div>
                <div className="polaris-lander-bento-visual polaris-lander-bento-visual--walk" />
              </article>

              <article className="polaris-lander-bento-card polaris-lander-bento-card--load">
                <div className="polaris-lander-bento-card-copy">
                  <p className="polaris-lander-bento-label">Load capacity</p>
                  <p className="polaris-lander-bento-stat polaris-lander-bento-stat--secondary">
                    Continuous walking load <strong>25&nbsp;kg</strong>
                  </p>
                  <p className="polaris-lander-bento-stat">Standing load 100&nbsp;kg</p>
                </div>
                <div className="polaris-lander-bento-visual polaris-lander-bento-visual--load" />
              </article>

              <article className="polaris-lander-bento-card polaris-lander-bento-card--material">
                <div className="polaris-lander-bento-card-copy">
                  <p className="polaris-lander-bento-label">Material</p>
                  <p className="polaris-lander-bento-body">
                    <strong>Aluminum alloy</strong> + high-strength engineering plastic
                  </p>
                </div>
                <div className="polaris-lander-bento-visual polaris-lander-bento-visual--material" />
              </article>

              <article className="polaris-lander-bento-card polaris-lander-bento-card--speed">
                <div className="polaris-lander-bento-card-copy">
                  <p className="polaris-lander-bento-label">Max running speed</p>
                  <p className="polaris-lander-bento-stat">Up to ~5&nbsp;m/s</p>
                </div>
                <div className="polaris-lander-bento-visual polaris-lander-bento-visual--speed" />
              </article>

              <article className="polaris-lander-bento-card polaris-lander-bento-card--compute">
                <div className="polaris-lander-bento-card-copy">
                  <p className="polaris-lander-bento-label">Computing module</p>
                  <p className="polaris-lander-bento-pill-row">
                    <span className="polaris-lander-bento-pill">Standard</span>
                  </p>
                  <p className="polaris-lander-bento-body polaris-lander-bento-body--tight">
                    8-core high-performance CPU (platform) + Intel Core i7 (user development)
                  </p>
                  <p className="polaris-lander-bento-pill-row">
                    <span className="polaris-lander-bento-pill polaris-lander-bento-pill--optional">
                      Optional
                    </span>
                  </p>
                  <p className="polaris-lander-bento-body polaris-lander-bento-body--tight">
                    High computing power expansion dock
                  </p>
                </div>
                <div className="polaris-lander-bento-visual polaris-lander-bento-visual--compute" />
              </article>
            </div>
          </div>
        </section>
      </main>
    </PolarisLayout>
  );
}
