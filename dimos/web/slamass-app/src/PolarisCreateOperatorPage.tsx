import {
  ArrowPathIcon,
  BoltIcon,
  CameraIcon,
  CubeIcon,
  MapIcon,
  PuzzlePieceIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import React from "react";

import { PolarisLayout } from "./PolarisLayout";
import {
  polarisNavigatorPath,
  writePolarisDeployPendingPayload,
} from "./polarisDeploySession";
import {
  POLARIS_AS2_PREVIEW_URL,
  POLARIS_CREATE_PICK_FIRST_URL,
  POLARIS_CREATE_PICK_SECOND_URL,
  POLARIS_OPERATOR_MOUNT_GO2_EDU_URL,
  POLARIS_OPERATOR_SELECT_THUMB_URL,
} from "./polarisAssets";

/** End effectors for Mount Manipulators — portrait tiles like G1/B2 on Choose Operator. */
const CREATE_MANIPULATOR_PICKS = [
  {
    id: "z1",
    testId: "polaris-create-mount-z1",
    name: "Z1 gripper",
    imageSrc: POLARIS_OPERATOR_SELECT_THUMB_URL,
    imageAlt: "Unitree Z1 gripper",
  },
  {
    id: "d1t",
    testId: "polaris-create-mount-d1t",
    name: "D1-T",
    imageSrc: POLARIS_OPERATOR_MOUNT_GO2_EDU_URL,
    imageAlt: "Unitree D1-T manipulator",
  },
  {
    id: "custom-mount",
    testId: "polaris-create-mount-custom-mount",
    name: "Custom mount",
    imageSrc: null,
    imageAlt: "",
  },
] as const;

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

const WIZARD_STEPS = [
  {
    title: "Choose Operator",
    lede:
      "An operator is a robot connected to Polaris. Deploying one means choosing a platform, " +
      "pointing it at a physical robot on your network, and defining what it can do. Once live, " +
      "it shows up on your dashboard with a camera feed, a map, and a command bar — ready to " +
      "take instructions from you or an AI agent.",
  },
  {
    title: "Define Skills",
    lede:
      "Choose which capabilities this operator exposes to Polaris and your agents — navigation, " +
      "manipulation, voice, and custom tools. You can refine these anytime after the operator is live.",
  },
  {
    title: "Mount Manipulators",
    lede:
      "Attach grippers, arms, or other end effectors and calibrate their frames so skills map cleanly " +
      "to the physical hardware. Skip this step if your platform is locomotion-only for now.",
  },
  {
    title: "Use case",
    lede:
      "Describe what this operator is for — patrol, lab assistance, telepresence, demos, or anything else. " +
      "The agent uses this context to stay aligned with your goals when planning and executing skills.",
  },
] as const;

const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

/** Capability bundles aligned with DimOS stacks (perception, nav, skills, agent). */
const DEFINE_SKILL_OPTIONS = [
  {
    id: "vision",
    label: "Vision",
    hint: "Cameras, detection, semantic POIs",
    Icon: CameraIcon,
  },
  {
    id: "voice",
    label: "Voice",
    hint: "Speech and TTS for agents",
    Icon: SpeakerWaveIcon,
  },
  {
    id: "navigation",
    label: "Navigation",
    hint: "Goals, paths, frontier exploration",
    Icon: MapIcon,
  },
  {
    id: "locomotion",
    label: "Locomotion",
    hint: "Walk, teleop, motion skills",
    Icon: BoltIcon,
  },
  {
    id: "manipulation",
    label: "Manipulation",
    hint: "Arms, grippers, manipulation skills",
    Icon: CubeIcon,
  },
  {
    id: "custom",
    label: "Custom Skill",
    hint: "User-defined tools and skill schemas",
    Icon: PuzzlePieceIcon,
    comingSoon: true,
  },
] as const;

type DefineSkillId = (typeof DEFINE_SKILL_OPTIONS)[number]["id"];

const PICK_CORNER_BADGE_CLASS =
  "pointer-events-none absolute bottom-2 right-2 z-[3] inline-flex items-center whitespace-nowrap rounded border border-slate-200/90 bg-white/95 px-2 py-px font-light uppercase tracking-wide text-slate-600 shadow-sm ring-1 ring-slate-100 sm:bottom-2.5 sm:right-2.5";

const PICK_CORNER_BADGE_GAP_DOT = "gap-1.5";

const PICK_CORNER_BADGE_ALPHA_TEXT = "text-[0.5rem] sm:text-[0.55rem]";

const PICK_CORNER_BADGE_LONG_TEXT =
  "text-[0.42rem] tracking-tight sm:text-[0.5rem] sm:tracking-wide";

const PICK_CORNER_BADGE_DOT_CLASS =
  "h-1 w-1 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_3px_rgba(16,185,129,0.75)] ring-1 ring-emerald-400/50";

export default function PolarisCreateOperatorPage(): React.ReactElement {
  const [wizardStep, setWizardStep] = React.useState(0);
  /** Persisted choice from click (Go2 card uses blue background when this is `go2`). */
  const [clickedPickId, setClickedPickId] = React.useState<string | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = React.useState<Set<DefineSkillId>>(
    () => new Set(),
  );
  const [selectedManipulatorId, setSelectedManipulatorId] = React.useState<string | null>(
    null,
  );
  const [agentUseCaseText, setAgentUseCaseText] = React.useState("");
  const [deployOverlay, setDeployOverlay] = React.useState(false);

  const toggleSkillId = React.useCallback((id: DefineSkillId) => {
    if (id === "custom") {
      return;
    }
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSkillKeyDown = React.useCallback(
    (event: React.KeyboardEvent, id: DefineSkillId) => {
      if (id === "custom") {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSkillId(id);
      }
    },
    [toggleSkillId],
  );

  const handlePickActivate = React.useCallback((pickId: string) => {
    setClickedPickId((prev) => (prev === pickId ? null : pickId));
  }, []);

  const handleGo2Activate = React.useCallback(() => {
    if (clickedPickId === "go2") {
      setClickedPickId(null);
      return;
    }
    setClickedPickId("go2");
    setWizardStep(1);
  }, [clickedPickId]);

  const handlePickKeyDown = React.useCallback(
    (event: React.KeyboardEvent, pickId: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (pickId === "go2") {
          handleGo2Activate();
        } else {
          handlePickActivate(pickId);
        }
      }
    },
    [handleGo2Activate, handlePickActivate],
  );

  const handleManipulatorActivate = React.useCallback((pickId: string) => {
    if (pickId === "custom-mount") {
      return;
    }
    setSelectedManipulatorId((prev) => (prev === pickId ? null : pickId));
  }, []);

  const handleManipulatorKeyDown = React.useCallback(
    (event: React.KeyboardEvent, pickId: string) => {
      if (pickId === "custom-mount") {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleManipulatorActivate(pickId);
      }
    },
    [handleManipulatorActivate],
  );

  const stepMeta = WIZARD_STEPS[wizardStep]!;
  const fillPercent = ((wizardStep + 1) / WIZARD_STEP_COUNT) * 100;
  const ariaStepNow = wizardStep + 1;
  const progressAriaText = `Step ${ariaStepNow} of ${WIZARD_STEP_COUNT}: ${stepMeta.title}`;

  return (
    <PolarisLayout shellBg="white">
      {deployOverlay ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="polaris-create-deploy-overlay"
          role="status"
        >
          <ArrowPathIcon
            aria-hidden
            className="polaris-create-deploy-overlay-spinner"
          />
          <span className="polaris-create-deploy-overlay-sr-only">Deploying operator…</span>
        </div>
      ) : null}
      <main className="polaris-operators-main polaris-create-main min-h-[calc(100vh-7rem)] bg-white px-4 py-8 sm:px-8 sm:py-10">
        <div className="polaris-operators-inner polaris-fade-stagger polaris-fade-stagger--create mx-auto w-full max-w-3xl">
          {wizardStep === 0 ? (
            <a
              className="polaris-navigator-back polaris-create-back"
              data-testid="polaris-create-back"
              href="/polaris/operators"
            >
              ← Operators
            </a>
          ) : (
            <button
              type="button"
              className="polaris-navigator-back polaris-create-back"
              data-testid="polaris-create-back"
              onClick={() => {
                setWizardStep((s) => Math.max(0, s - 1));
              }}
            >
              ← {WIZARD_STEPS[wizardStep - 1]!.title}
            </button>
          )}
          <div className="polaris-operators-page-head polaris-create-page-head">
            <h1
              className="polaris-operators-page-title"
              data-testid="polaris-create-heading"
            >
              {stepMeta.title}
            </h1>
          </div>
          <p className="polaris-operator-card-sub polaris-create-lede">{stepMeta.lede}</p>
          {wizardStep === 0 ? (
            <div className="polaris-create-pick-block">
              <ul aria-label="Robots" className="polaris-create-pick-grid">
                {CREATE_OPERATOR_PICKS.map((pick) => {
                  const pickUsesPortraitStyle =
                    pick.id === "g1" || pick.id === "as2";
                  return (
                    <li className="polaris-create-pick-cell" key={pick.id}>
                      <article
                        aria-label={pick.name}
                        aria-pressed={clickedPickId === pick.id}
                        className={[
                          "polaris-create-pick-card polaris-create-pick-card--activatable",
                          pickUsesPortraitStyle &&
                            "polaris-create-pick-card--portrait relative overflow-hidden",
                          pick.id === "go2" &&
                            "relative polaris-create-pick-card--go2-hover polaris-create-pick-card--robot-well",
                          pick.id === "go2" &&
                            clickedPickId === "go2" &&
                            "polaris-create-pick-card--go2-selected",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-testid={pick.testId}
                        onClick={() => {
                          if (pick.id === "go2") {
                            handleGo2Activate();
                          } else {
                            handlePickActivate(pick.id);
                          }
                        }}
                        onKeyDown={(e) => {
                          handlePickKeyDown(e, pick.id);
                        }}
                        role="button"
                        tabIndex={0}
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
            </div>
          ) : wizardStep === 2 ? (
            <div className="polaris-create-step-surface" data-testid="polaris-create-mount-manipulators">
              <div className="polaris-create-pick-block">
                <ul aria-label="Manipulators" className="polaris-create-pick-grid" role="list">
                  {CREATE_MANIPULATOR_PICKS.map((pick) => {
                    const isComingSoon = pick.id === "custom-mount";
                    const selected = !isComingSoon && selectedManipulatorId === pick.id;
                    return (
                      <li className="polaris-create-pick-cell" key={pick.id} role="listitem">
                        <article
                          aria-label={
                            isComingSoon
                              ? `${pick.name} (coming soon). User-defined mount hardware.`
                              : `${pick.name}${selected ? ", selected" : ""}`
                          }
                          aria-pressed={
                            isComingSoon ? undefined : selectedManipulatorId === pick.id
                          }
                          className={[
                            "polaris-create-pick-card polaris-create-pick-card--portrait relative overflow-hidden",
                            !isComingSoon && "polaris-create-mount-pick--white",
                            !isComingSoon && "polaris-create-pick-card--activatable",
                            !isComingSoon && "polaris-create-pick-card--go2-hover",
                            selected ? "polaris-create-pick-card--go2-selected" : "",
                            isComingSoon && "pointer-events-none",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          data-testid={pick.testId}
                          onClick={
                            isComingSoon
                              ? undefined
                              : () => {
                                  handleManipulatorActivate(pick.id);
                                }
                          }
                          onKeyDown={
                            isComingSoon
                              ? undefined
                              : (e) => {
                                  handleManipulatorKeyDown(e, pick.id);
                                }
                          }
                          role={isComingSoon ? undefined : "button"}
                          tabIndex={isComingSoon ? undefined : 0}
                        >
                          <div
                            className={[
                              "polaris-operator-card-body polaris-create-pick-card-body",
                              isComingSoon && "opacity-55",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <h2
                              className={[
                                "polaris-operator-card-title",
                                isComingSoon && "polaris-create-mount-custom-mount-title",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <span className="polaris-operator-card-title-text">
                                {pick.name}
                              </span>
                            </h2>
                          </div>
                          <div className="polaris-create-pick-card-media">
                            {pick.imageSrc != null ? (
                              <img
                                alt={pick.imageAlt}
                                className="polaris-create-pick-card-img"
                                decoding="async"
                                src={pick.imageSrc}
                              />
                            ) : (
                              <span className="polaris-operator-card-placeholder polaris-create-mount-empty-preview">
                                Preview
                              </span>
                            )}
                          </div>
                          {isComingSoon ? (
                            <>
                              <div
                                aria-hidden
                                className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-white/28 via-white/15 to-white/32"
                              />
                              <div
                                aria-hidden
                                className="pointer-events-none absolute inset-0 z-[2] bg-gradient-to-t from-white from-0% via-white/55 via-35% to-transparent to-100%"
                              />
                              <span
                                aria-label="Coming soon"
                                className={`${PICK_CORNER_BADGE_CLASS} ${PICK_CORNER_BADGE_LONG_TEXT}`}
                                data-testid="polaris-create-mount-custom-mount-coming-soon"
                              >
                                COMING SOON
                              </span>
                            </>
                          ) : null}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : wizardStep === 1 ? (
            <div
              className="polaris-create-step-surface"
              data-testid="polaris-create-define-skills"
            >
              <div className="polaris-create-pick-block">
                <ul
                  aria-label="Skill bundles"
                  className="polaris-create-pick-grid polaris-create-pick-grid--skills"
                  role="list"
                >
                  {DEFINE_SKILL_OPTIONS.map((opt) => {
                      const comingSoon =
                        "comingSoon" in opt && opt.comingSoon === true;
                      const selected =
                        !comingSoon && selectedSkillIds.has(opt.id);
                      const { Icon } = opt;
                      return (
                        <li className="polaris-create-pick-cell" key={opt.id} role="listitem">
                          <article
                            aria-label={
                              comingSoon
                                ? `${opt.label} (coming soon). ${opt.hint}`
                                : `${opt.label}. ${opt.hint}`
                            }
                            aria-pressed={comingSoon ? undefined : selected}
                            className={[
                              "polaris-create-pick-card polaris-create-pick-card--skill-square",
                              comingSoon
                                ? "polaris-create-pick-card--skill-soon pointer-events-none relative overflow-hidden"
                                : [
                                    "polaris-create-pick-card--activatable",
                                    "relative polaris-create-pick-card--go2-hover",
                                    selected ? "polaris-create-pick-card--go2-selected" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" "),
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            data-testid={`polaris-create-skill-${opt.id}`}
                            onClick={
                              comingSoon
                                ? undefined
                                : () => {
                                    toggleSkillId(opt.id);
                                  }
                            }
                            onKeyDown={
                              comingSoon
                                ? undefined
                                : (e) => {
                                    handleSkillKeyDown(e, opt.id);
                                  }
                            }
                            role={comingSoon ? undefined : "button"}
                            tabIndex={comingSoon ? undefined : 0}
                          >
                            {comingSoon ? (
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
                            <div
                              className={[
                                "polaris-create-pick-card-media polaris-create-skill-square-media",
                                comingSoon && "opacity-50",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <Icon aria-hidden className="polaris-create-skill-pick-icon" />
                            </div>
                            <div
                              className={[
                                "polaris-operator-card-body polaris-create-pick-card-body polaris-create-skill-square-body",
                                comingSoon && "opacity-55",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <h2 className="polaris-operator-card-title polaris-create-skill-square-title">
                                <span className="polaris-operator-card-title-text">
                                  {opt.label}
                                </span>
                              </h2>
                            </div>
                            {comingSoon ? (
                              <span
                                aria-label="Coming soon"
                                className={`${PICK_CORNER_BADGE_CLASS} ${PICK_CORNER_BADGE_LONG_TEXT}`}
                                data-testid="polaris-create-skill-custom-coming-soon"
                              >
                                COMING SOON
                              </span>
                            ) : null}
                          </article>
                        </li>
                      );
                    })}
                  </ul>
              </div>
            </div>
          ) : (
            <div className="polaris-create-step-surface" data-testid="polaris-create-use-case">
              <div className="polaris-create-use-case-panel">
                <textarea
                  aria-describedby="polaris-create-use-case-hint"
                  aria-label="Use case description"
                  className="polaris-create-use-case-textarea"
                  data-testid="polaris-create-use-case-textarea"
                  id="polaris-create-use-case-textarea"
                  maxLength={4000}
                  onChange={(event) => {
                    setAgentUseCaseText(event.target.value);
                  }}
                  placeholder="e.g. Patrol the lab after hours, escort visitors, or run manipulation demos on the bench…"
                  rows={7}
                  value={agentUseCaseText}
                />
                <p className="polaris-create-use-case-hint" id="polaris-create-use-case-hint">
                  Optional for now — you can edit this later in operator settings. Shown to the agent as
                  high-level intent, not as executable instructions.
                </p>
              </div>
            </div>
          )}
          {wizardStep === WIZARD_STEP_COUNT - 1 ? (
            <div className="polaris-create-wizard-actions">
              <button
                className="polaris-operators-add-button polaris-create-wizard-cta"
                data-testid="polaris-create-wizard-deploy"
                disabled={deployOverlay}
                type="button"
                onClick={() => {
                  if (deployOverlay) {
                    return;
                  }
                  const pickId = clickedPickId ?? "go2";
                  writePolarisDeployPendingPayload({
                    pickId,
                    useCase: agentUseCaseText,
                    manipulatorId: selectedManipulatorId,
                  });
                  setDeployOverlay(true);
                  window.setTimeout(() => {
                    window.location.assign(polarisNavigatorPath());
                  }, 1100);
                }}
              >
                Deploy
              </button>
            </div>
          ) : null}
          <aside
            aria-label="Setup progress"
            className="polaris-create-progress-line"
            data-testid="polaris-create-selector-progress"
          >
            <div
              aria-valuemax={WIZARD_STEP_COUNT}
              aria-valuemin={0}
              aria-valuenow={ariaStepNow}
              aria-valuetext={progressAriaText}
              className="polaris-create-progress-line-track"
              role="progressbar"
            >
              <div
                className="polaris-create-progress-line-fill"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </aside>
          {wizardStep === 1 || wizardStep === 2 ? (
            <div
              className="polaris-create-wizard-advance-footer"
              data-testid="polaris-create-advance-footer"
            >
              {wizardStep === 1 ? (
                <button
                  type="button"
                  className="polaris-create-step-inline-advance polaris-create-step-inline-advance--footer"
                  data-testid="polaris-create-advance-mount"
                  onClick={() => {
                    setWizardStep(2);
                  }}
                >
                  Mount manipulators →
                </button>
              ) : (
                <button
                  type="button"
                  className="polaris-create-step-inline-advance polaris-create-step-inline-advance--footer"
                  data-testid="polaris-create-advance-use-case"
                  onClick={() => {
                    setWizardStep(3);
                  }}
                >
                  Describe use case →
                </button>
              )}
            </div>
          ) : null}
        </div>
      </main>
    </PolarisLayout>
  );
}
