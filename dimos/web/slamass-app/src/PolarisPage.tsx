import React from "react";

import { PolarisLayout } from "./PolarisLayout";
import { POLARIS_OPERATOR_FLEET } from "./polarisOperatorFleet";

export default function PolarisPage(): React.ReactElement {
  return (
    <PolarisLayout>
      <main className="polaris-operators-main min-h-[calc(100vh-7rem)] bg-white px-4 py-8 sm:px-8 sm:py-10">
        <div className="polaris-operators-inner polaris-fade-stagger polaris-fade-stagger--operators mx-auto w-full max-w-3xl">
          <div className="polaris-operators-page-head polaris-operators-page-head--operators-stack">
            <h1 className="polaris-operators-page-title" data-testid="polaris-operators-heading">
              Operators
            </h1>
            <a
              className="polaris-operators-add-button polaris-operators-add-button--operators-list-cta"
              data-testid="polaris-add-operator-button"
              href="/polaris/create"
            >
              <span aria-hidden className="polaris-operators-add-button-plus">
                +
              </span>
              Add Operator
            </a>
          </div>
          <ul
            aria-label="Operators"
            className="polaris-operators-list"
            role="list"
          >
            {POLARIS_OPERATOR_FLEET.map((op) => (
              <li className="polaris-operators-list-item" key={op.id} role="listitem">
                <article
                  aria-label={op.title}
                  className="polaris-operator-card"
                  data-testid="polaris-robot-slot"
                >
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
                          aria-label={
                            op.active === "blue"
                              ? "Standby"
                              : op.active === "grey"
                                ? "Inactive"
                                : "Active"
                          }
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
                    <p className="polaris-operator-card-sub polaris-operator-card-meta">
                      <span className="polaris-operator-card-meta-label">Mount</span>{" "}
                      <span className="polaris-operator-card-meta-value">
                        {op.mountThumbUrl ? (op.mountValue ?? "Z1") : "—"}
                      </span>
                    </p>
                  </div>
                  <div className="polaris-operator-card-cta-column">
                    <a className="polaris-operator-card-cta" href="/polaris/navigator">
                      <span className="polaris-operator-card-cta-label">Navigator</span>
                      <span aria-hidden className="polaris-operator-card-cta-icon">
                        ↗
                      </span>
                    </a>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </PolarisLayout>
  );
}
