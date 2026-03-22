import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

import { POLARIS_OPERATOR_FLEET } from "../polarisOperatorFleet";
import { NavigatorOptionCard } from "./NavigatorOptionCard";

function statusLabel(active: "green" | "blue" | "grey"): string {
  if (active === "blue") {
    return "Standby";
  }
  if (active === "grey") {
    return "Inactive";
  }
  return "Active";
}

function NavigatorOperatorFleetList(): React.ReactElement {
  return (
    <div className="polaris-nav-operators-embed-shell">
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
                  <span className="polaris-operator-card-meta-label">Mission</span>{" "}
                  <span className="polaris-operator-card-meta-value">{op.task}</span>
                </p>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Fleet roster in the navigator “Operators” column — same card structure as `/polaris/operators`, scaled for the sidebar.
 */
export function NavigatorOperatorFleet(): React.ReactElement {
  const [extended, setExtended] = useState(false);
  const titleId = useId();
  const collapseButtonRef = useRef<HTMLButtonElement>(null);

  const closeExtended = useCallback(() => {
    setExtended(false);
  }, []);

  useEffect(() => {
    if (!extended) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      collapseButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [extended]);

  useEffect(() => {
    if (!extended) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [extended]);

  useEffect(() => {
    if (!extended) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExtended();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [extended, closeExtended]);

  return (
    <>
      <NavigatorOptionCard
        className="polaris-nav-operators-fleet-card polaris-nav-option-card--polaris-heading"
        headerAside={
          <div className="polaris-nav-operators-header-aside">
            <button
              aria-expanded={extended}
              aria-label="Expand operators"
              className="polaris-nav-operators-extend-btn"
              data-testid="polaris-nav-operators-expand"
              type="button"
              onClick={() => {
                setExtended(true);
              }}
            >
              <ArrowsPointingOutIcon
                aria-hidden
                className="polaris-nav-operators-extend-btn-icon"
              />
            </button>
          </div>
        }
        title="Operators"
      >
        <NavigatorOperatorFleetList />
      </NavigatorOptionCard>

      {extended ? (
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="polaris-nav-operators-extend-overlay"
          role="dialog"
        >
          <button
            aria-label="Close expanded operators"
            className="polaris-nav-operators-extend-backdrop"
            type="button"
            onClick={closeExtended}
          />
          <div className="polaris-nav-operators-extend-panel">
            <header className="polaris-nav-operators-extend-panel-head">
              <h2 className="polaris-nav-operators-extend-panel-title" id={titleId}>
                Operators
              </h2>
              <button
                ref={collapseButtonRef}
                aria-label="Collapse operators"
                className="polaris-nav-operators-extend-btn"
                data-testid="polaris-nav-operators-collapse"
                type="button"
                onClick={closeExtended}
              >
                <ArrowsPointingInIcon
                  aria-hidden
                  className="polaris-nav-operators-extend-btn-icon"
                />
              </button>
            </header>
            <div className="polaris-nav-operators-extend-panel-body">
              <NavigatorOperatorFleetList />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
