import React from "react";

import { PolarisLayout } from "./PolarisLayout";
import {
  POLARIS_AS2_PREVIEW_URL,
  POLARIS_CREATE_PICK_FIRST_URL,
  POLARIS_CREATE_PICK_SECOND_URL,
} from "./polarisAssets";

const CREATE_OPERATOR_PICKS = [
  {
    id: "go2",
    testId: "polaris-create-pick-go2",
    imageSrc: POLARIS_CREATE_PICK_FIRST_URL,
    imageAlt: "Unitree Go2 quadruped robot",
    name: "Unitree Go2",
  },
  {
    id: "g1",
    testId: "polaris-create-pick-g1",
    imageSrc: POLARIS_CREATE_PICK_SECOND_URL,
    imageAlt: "Unitree G1 humanoid robot",
    name: "Unitree G1",
  },
  {
    id: "as2",
    testId: "polaris-create-pick-as2",
    imageSrc: POLARIS_AS2_PREVIEW_URL,
    imageAlt: "Unitree B2",
    name: "Unitree B2",
  },
] as const;

/** Flow bar assumes ~5 onboarding steps; hovers on the first picks advance 1/5 per card. */
const CREATE_FLOW_STEP_COUNT = 5;

/** Idle: first segment stays visible (~screenshot); hover never shrinks below this. */
const CREATE_PROGRESS_BASE_PERCENT = 24;

const PICK_CORNER_BADGE_CLASS =
  "pointer-events-none absolute bottom-2 right-2 z-[3] inline-flex items-center whitespace-nowrap rounded border border-slate-200/90 bg-white/95 px-2 py-px font-light uppercase tracking-wide text-slate-600 shadow-sm ring-1 ring-slate-100 sm:bottom-2.5 sm:right-2.5";

const PICK_CORNER_BADGE_GAP_DOT = "gap-1.5";

const PICK_CORNER_BADGE_ALPHA_TEXT = "text-[0.5rem] sm:text-[0.55rem]";

const PICK_CORNER_BADGE_LONG_TEXT =
  "text-[0.42rem] tracking-tight sm:text-[0.5rem] sm:tracking-wide";

const PICK_CORNER_BADGE_DOT_CLASS =
  "h-1 w-1 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_3px_rgba(16,185,129,0.75)] ring-1 ring-emerald-400/50";

export default function PolarisCreateOperatorPage(): React.ReactElement {
  const [activePickIndex, setActivePickIndex] = React.useState<number | null>(
    null,
  );
  const activePick =
    activePickIndex != null ? CREATE_OPERATOR_PICKS[activePickIndex] : null;
  const completedSteps =
    activePickIndex === null
      ? 0
      : Math.min(activePickIndex + 1, CREATE_FLOW_STEP_COUNT);
  const fillPercent =
    activePickIndex === null
      ? CREATE_PROGRESS_BASE_PERCENT
      : Math.max(
          CREATE_PROGRESS_BASE_PERCENT,
          (completedSteps / CREATE_FLOW_STEP_COUNT) * 100,
        );
  const ariaStepValue =
    fillPercent <= 0
      ? 0
      : Math.min(
          CREATE_FLOW_STEP_COUNT,
          Math.max(1, Math.round((fillPercent / 100) * CREATE_FLOW_STEP_COUNT)),
        );

  return (
    <PolarisLayout shellBg="white">
      <main className="polaris-operators-main polaris-create-main min-h-[calc(100vh-7rem)] bg-white px-4 py-8 sm:px-8 sm:py-10">
        <div className="polaris-operators-inner polaris-fade-stagger polaris-fade-stagger--create mx-auto w-full max-w-3xl">
          <a
            className="polaris-configurator-back polaris-create-back"
            data-testid="polaris-create-back"
            href="/polaris/operators"
          >
            ← Operators
          </a>
          <div className="polaris-operators-page-head polaris-create-page-head">
            <h1
              className="polaris-operators-page-title"
              data-testid="polaris-create-heading"
            >
              Choose Operator
            </h1>
          </div>
          <p className="polaris-operator-card-sub polaris-create-lede">
            Select a robot profile to continue. Additional onboarding steps will
            follow once APIs are wired.
          </p>
          <hr className="polaris-skild-rule polaris-create-rule" />
          <div
            className="polaris-create-pick-block"
            onMouseLeave={() => setActivePickIndex(null)}
          >
            <ul aria-label="Robots" className="polaris-create-pick-grid">
              {CREATE_OPERATOR_PICKS.map((pick, pickIndex) => {
                const pickUsesPortraitStyle =
                  pick.id === "g1" || pick.id === "as2";
                return (
                  <li
                    className="polaris-create-pick-cell"
                    key={pick.id}
                    onMouseEnter={() => setActivePickIndex(pickIndex)}
                  >
                    <article
                      aria-label={pick.name}
                      className={[
                        "polaris-create-pick-card",
                        pickUsesPortraitStyle &&
                          "polaris-create-pick-card--portrait relative overflow-hidden",
                        pick.id === "go2" &&
                          "relative polaris-create-pick-card--go2-hover",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-testid={pick.testId}
                    >
                      <div
                        className={[
                          "polaris-operator-card-body polaris-create-pick-card-body",
                          pickUsesPortraitStyle && "opacity-55",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <h2 className="polaris-operator-card-title">
                          <span className="polaris-operator-card-title-text">
                            {pick.name}
                          </span>
                        </h2>
                      </div>
                      <div className="polaris-create-pick-card-media">
                        <img
                          alt={pick.imageAlt}
                          className={[
                            "polaris-create-pick-card-img",
                            pickUsesPortraitStyle && "opacity-50",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          decoding="async"
                          src={pick.imageSrc}
                        />
                      </div>
                      {pickUsesPortraitStyle ? (
                        <>
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/28 via-white/15 to-white/32"
                          />
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-white from-0% via-white/55 via-35% to-transparent to-100%"
                          />
                        </>
                      ) : null}
                      {pick.id === "go2" ? (
                        <span
                          aria-label="Alpha release"
                          className={`${PICK_CORNER_BADGE_CLASS} ${PICK_CORNER_BADGE_GAP_DOT} ${PICK_CORNER_BADGE_ALPHA_TEXT}`}
                          data-testid="polaris-create-pick-go2-alpha"
                        >
                          <span
                            aria-hidden
                            className={PICK_CORNER_BADGE_DOT_CLASS}
                          />
                          Alpha
                        </span>
                      ) : null}
                      {pickUsesPortraitStyle ? (
                        <span
                          aria-label="Coming soon"
                          className={`${PICK_CORNER_BADGE_CLASS} ${PICK_CORNER_BADGE_LONG_TEXT}`}
                          data-testid={
                            pick.id === "g1"
                              ? "polaris-create-pick-g1-coming-soon"
                              : "polaris-create-pick-as2-coming-soon"
                          }
                        >
                          COMING SOON
                        </span>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
            <aside
              aria-label="Setup progress"
              className="polaris-create-progress-line"
              data-testid="polaris-create-selector-progress"
            >
              <div
                aria-valuemax={CREATE_FLOW_STEP_COUNT}
                aria-valuemin={0}
                aria-valuenow={ariaStepValue}
                aria-valuetext={
                  activePick != null
                    ? `Step ${ariaStepValue} of ${CREATE_FLOW_STEP_COUNT}: ${activePick.name}`
                    : `Step ${ariaStepValue} of ${CREATE_FLOW_STEP_COUNT} visible; hover a robot profile`
                }
                className="polaris-create-progress-line-track"
                role="progressbar"
              >
                <div
                  className="polaris-create-progress-line-fill"
                  style={{ width: `${fillPercent}%` }}
                />
              </div>
            </aside>
          </div>
        </div>
      </main>
    </PolarisLayout>
  );
}
