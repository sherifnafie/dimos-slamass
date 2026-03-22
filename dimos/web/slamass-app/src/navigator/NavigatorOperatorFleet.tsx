import React from "react";

import { POLARIS_OPERATOR_FLEET } from "../polarisOperatorFleet";
import type { InspectionState } from "../types";
import { NavigatorOptionCard } from "./NavigatorOptionCard";

/** Primary quadruped row that reflects live Navigator / slamass inspection state. */
const INSPECTION_STATUS_OPERATOR_IDS = new Set<string>(["go2", "go2-platform"]);

function statusLabel(active: "green" | "blue" | "grey"): string {
  if (active === "blue") {
    return "Standby";
  }
  if (active === "grey") {
    return "Inactive";
  }
  return "Active";
}

export type NavigatorOperatorFleetProps = {
  inspection?: InspectionState;
};

/**
 * Fleet roster in the navigator “Operators” column — same card structure as `/polaris/operators`, scaled for the sidebar.
 */
export function NavigatorOperatorFleet(props: NavigatorOperatorFleetProps): React.ReactElement {
  const { inspection } = props;
  const liveMission =
    inspection?.status === "running" && inspection.message.trim() !== ""
      ? inspection.message
      : null;

  return (
    <NavigatorOptionCard
      className="polaris-nav-option-card--polaris-heading"
      headerAside={
        <a className="polaris-nav-operators-view-all" href="/polaris/operators">
          View all
        </a>
      }
      title="Operators"
    >
      <ul
        aria-label="Operators"
        className="polaris-operators-list polaris-nav-operators-embed"
        role="list"
      >
        {POLARIS_OPERATOR_FLEET.map((op) => (
          <li className="polaris-operators-list-item" key={op.id} role="listitem">
            <article
              aria-label={op.title}
              className="polaris-operator-card polaris-nav-operators-embed-card"
              data-testid={`polaris-nav-operator-${op.id}`}
            >
              <a
                aria-label={`View ${op.title} on Operators`}
                className="polaris-nav-operators-embed-hit"
                href="/polaris/operators"
              />
              <div className="polaris-operator-card-media-column">
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
                      className="polaris-operator-card-img polaris-operator-card-img--static"
                      decoding="async"
                      src={op.imageUrl}
                    />
                  ) : (
                    <span className="polaris-operator-card-placeholder">
                      {op.emptyVisualLabel ?? "Preview"}
                    </span>
                  )}
                </div>
              </div>
              <div className="polaris-operator-card-body">
                <h2 className="polaris-operator-card-title">
                  <span className="polaris-operator-card-title-text">
                    {op.titleHref ? (
                      <a
                        className="polaris-operator-card-title-link"
                        href={op.titleHref}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {op.title}
                      </a>
                    ) : (
                      op.title
                    )}
                  </span>
                  {op.active ? (
                    <span
                      aria-label={statusLabel(op.active)}
                      className="polaris-operator-card-active"
                      role="status"
                    >
                      <span
                        aria-hidden
                        className={
                          op.active === "blue"
                            ? "polaris-operator-card-active-dot polaris-operator-card-active-dot--blue"
                            : op.active === "grey"
                              ? "polaris-operator-card-active-dot polaris-operator-card-active-dot--grey"
                              : "polaris-operator-card-active-dot polaris-operator-card-active-dot--green"
                        }
                      />
                    </span>
                  ) : null}
                </h2>
                {op.category ? (
                  <p className="polaris-operator-card-sub polaris-operator-card-meta">
                    <span className="polaris-operator-card-meta-label">{op.category.label}</span>{" "}
                    <span className="polaris-operator-card-meta-value">{op.category.value}</span>
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
                {liveMission && INSPECTION_STATUS_OPERATOR_IDS.has(op.id) ? (
                  <p
                    aria-live="polite"
                    className="polaris-operator-card-sub polaris-operator-card-meta polaris-nav-operators-embed-mission"
                    data-testid="polaris-nav-operator-mission"
                  >
                    <span className="polaris-operator-card-meta-label">Mission</span>{" "}
                    <span className="polaris-operator-card-meta-value">{liveMission}</span>
                  </p>
                ) : null}
              </div>
              <div className="polaris-operator-card-cta-column">
                <span className="polaris-operator-card-cta polaris-nav-operators-embed-cta-fake">
                  <span className="polaris-operator-card-cta-label">Operators</span>
                  <span aria-hidden className="polaris-operator-card-cta-icon">
                    ↗
                  </span>
                </span>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </NavigatorOptionCard>
  );
}
