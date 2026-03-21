import React from "react";

import { PolarisLayout } from "./PolarisLayout";
import {
  POLARIS_GO2_PREVIEW_URL,
  POLARIS_SIDEBAR_OPERATORS_IMAGE_URL,
} from "./polarisAssets";

type OperatorCard = {
  id: string;
  title: string;
  /** Bold label + light value, same pattern as Location / Task. */
  category?: { label: string; value: string };
  location: string;
  task: string;
  imageUrl: string | null;
  imageAlt: string;
  /** Pulsing status dot after the title: green (active) or blue (e.g. standby). */
  active?: "green" | "blue";
  /** Shown in the image well when there is no photo (defaults to “Preview”). */
  emptyVisualLabel?: string;
};

const OPERATOR_CARDS: OperatorCard[] = [
  {
    id: "go2",
    title: "Unitree Go2",
    category: { label: "Type", value: "Quadruped" },
    location: "Floor lab",
    task: "Patrol",
    active: "green",
    imageUrl: POLARIS_GO2_PREVIEW_URL,
    imageAlt: "Unitree Go2 robot",
  },
  {
    id: "go2-platform",
    title: "Unitree Go2",
    category: { label: "Type", value: "Hardware" },
    location: "Bench",
    task: "Calibration",
    active: "green",
    imageUrl: POLARIS_SIDEBAR_OPERATORS_IMAGE_URL,
    imageAlt: "Unitree Go2",
  },
  {
    id: "go2-third",
    title: "Unitree Go2",
    category: { label: "Type", value: "Quadruped" },
    location: "—",
    task: "—",
    active: "blue",
    imageUrl: null,
    imageAlt: "",
    emptyVisualLabel: "Unitree Go2",
  },
  {
    id: "deploy",
    title: "Deploy operator",
    location: "—",
    task: "—",
    imageUrl: null,
    imageAlt: "",
    emptyVisualLabel: "Deploy operator",
  },
];

export default function PolarisPage(): React.ReactElement {
  return (
    <PolarisLayout>
      <main className="polaris-operators-main min-h-[calc(100vh-7rem)] bg-white px-4 py-8 sm:px-8 sm:py-10">
        <div className="polaris-operators-inner mx-auto w-full max-w-3xl">
          <div className="polaris-operators-page-head">
            <h1 className="polaris-operators-page-title" data-testid="polaris-operators-heading">
              Operators
            </h1>
            <button
              className="polaris-operators-add-button"
              data-testid="polaris-add-operator-button"
              type="button"
            >
              Add Operator
            </button>
          </div>
          <ul
            aria-label="Operators"
            className="polaris-operators-list"
            role="list"
          >
            {OPERATOR_CARDS.map((op) => (
              <li className="polaris-operators-list-item" key={op.id} role="listitem">
                <article
                  aria-label={op.title}
                  className="polaris-operator-card"
                  data-testid="polaris-robot-slot"
                >
                  <div
                    className={
                      op.imageUrl
                        ? "polaris-operator-card-visual"
                        : "polaris-operator-card-visual polaris-operator-card-visual--empty"
                    }
                  >
                    {op.imageUrl ? (
                      <img
                        alt={op.imageAlt}
                        className="polaris-operator-card-img"
                        decoding="async"
                        src={op.imageUrl}
                      />
                    ) : (
                      <span className="polaris-operator-card-placeholder">
                        {op.emptyVisualLabel ?? "Preview"}
                      </span>
                    )}
                  </div>
                  <div className="polaris-operator-card-body">
                    <h2 className="polaris-operator-card-title">
                      <span className="polaris-operator-card-title-text">{op.title}</span>
                      {op.active ? (
                        <span
                          aria-label={op.active === "blue" ? "Standby" : "Active"}
                          className="polaris-operator-card-active"
                          role="status"
                        >
                          <span
                            aria-hidden
                            className={
                              op.active === "blue"
                                ? "polaris-operator-card-active-dot polaris-operator-card-active-dot--blue"
                                : "polaris-operator-card-active-dot polaris-operator-card-active-dot--green"
                            }
                          />
                        </span>
                      ) : null}
                    </h2>
                    {op.category ? (
                      <p className="polaris-operator-card-sub polaris-operator-card-meta">
                        <span className="polaris-operator-card-meta-label">
                          {op.category.label}
                        </span>{" "}
                        <span className="polaris-operator-card-meta-value">
                          {op.category.value}
                        </span>
                      </p>
                    ) : null}
                    <p className="polaris-operator-card-sub polaris-operator-card-meta">
                      <span className="polaris-operator-card-meta-label">Location</span>{" "}
                      <span className="polaris-operator-card-meta-value">{op.location}</span>
                    </p>
                    <p className="polaris-operator-card-sub polaris-operator-card-meta">
                      <span className="polaris-operator-card-meta-label">Task</span>{" "}
                      <span className="polaris-operator-card-meta-value">{op.task}</span>
                    </p>
                  </div>
                  <button
                    className="polaris-operator-card-cta"
                    type="button"
                  >
                    <span className="polaris-operator-card-cta-label">Select</span>
                    <span aria-hidden className="polaris-operator-card-cta-icon">
                      ↗
                    </span>
                  </button>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </PolarisLayout>
  );
}
