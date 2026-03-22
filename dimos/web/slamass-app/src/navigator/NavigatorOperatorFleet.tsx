import React from "react";

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

/**
 * Compact fleet roster in the navigator “Operators” column (links to `/polaris/operators`).
 */
export function NavigatorOperatorFleet(): React.ReactElement {
  return (
    <NavigatorOptionCard
      description="Same roster as the operators hub — open a row to manage the fleet."
      headerAside={
        <a className="polaris-nav-operators-view-all" href="/polaris/operators">
          View all
        </a>
      }
      kicker="Fleet"
      title="Registered operators"
    >
      <ul aria-label="Registered operators" className="polaris-nav-operators-list" role="list">
        {POLARIS_OPERATOR_FLEET.map((op) => (
          <li className="polaris-nav-operators-item" key={op.id}>
            <a
              className="polaris-nav-operator-row"
              data-testid={`polaris-nav-operator-${op.id}`}
              href="/polaris/operators"
            >
              <span className="polaris-nav-operator-thumb">
                {op.imageUrl ? (
                  <img
                    alt=""
                    className="polaris-nav-operator-thumb-img"
                    decoding="async"
                    src={op.imageUrl}
                  />
                ) : (
                  <span className="polaris-nav-operator-thumb-placeholder">
                    {op.emptyVisualLabel ?? "—"}
                  </span>
                )}
              </span>
              <span className="polaris-nav-operator-copy">
                <span className="polaris-nav-operator-name">{op.title}</span>
                {op.category ? (
                  <span className="polaris-nav-operator-type">{op.category.value}</span>
                ) : null}
              </span>
              {op.active ? (
                <span
                  aria-label={statusLabel(op.active)}
                  className="polaris-operator-card-active polaris-nav-operator-status"
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
            </a>
          </li>
        ))}
      </ul>
    </NavigatorOptionCard>
  );
}
