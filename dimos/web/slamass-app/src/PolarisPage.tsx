import React from "react";

import { apiUrl } from "./apiBase";
import { PolarisLayout } from "./PolarisLayout";
import {
  POLARIS_A2_PREVIEW_URL,
  POLARIS_AS2_PREVIEW_URL,
  POLARIS_GO2_EDU_PREVIEW_URL,
  POLARIS_GO2_PREVIEW_URL,
  POLARIS_OPERATOR_MOUNT_GO2_EDU_URL,
  POLARIS_OPERATOR_SELECT_THUMB_URL,
} from "./polarisAssets";

type OperatorCard = {
  id: string;
  title: string;
  /** If set, the title is rendered as an external link (e.g. product page). */
  titleHref?: string;
  /** Bold label + light value, same pattern as Location / Task. */
  category?: { label: string; value: string };
  location: string;
  task: string;
  imageUrl: string | null;
  imageAlt: string;
  /** Pulsing status dot after the title: green (active), blue (standby), or grey (inactive). */
  active?: "green" | "blue" | "grey";
  /** Shown in the image well when there is no photo (defaults to “Preview”). */
  emptyVisualLabel?: string;
  /** Mount thumbnail under Configurator; `null` = empty slot (no image). */
  mountThumbUrl: string | null;
  /** Value next to “Mount” in meta when `mountThumbUrl` is set (default `Z1`). */
  mountValue?: string;
  /** If set, mount thumbnail opens this URL in a new tab. */
  mountThumbHref?: string;
  /** When true, hovering the card shows the SLAMASS live POV in the image well. */
  slamassPovOnHover?: boolean;
};

const OPERATOR_CARDS: OperatorCard[] = [
  {
    id: "go2",
    title: "Unitree Go2",
    category: { label: "Type", value: "Unitree Go2 X" },
    location: "Floor lab",
    task: "Patrol",
    active: "green",
    imageUrl: POLARIS_GO2_PREVIEW_URL,
    imageAlt: "Unitree Go2 robot",
    mountThumbUrl: POLARIS_OPERATOR_SELECT_THUMB_URL,
    slamassPovOnHover: true,
  },
  {
    id: "go2-platform",
    title: "Unitree Go2",
    category: { label: "Type", value: "Unitree Go2 EDU" },
    location: "Bench",
    task: "Calibration",
    active: "green",
    imageUrl: POLARIS_GO2_EDU_PREVIEW_URL,
    imageAlt: "Unitree Go2",
    slamassPovOnHover: true,
    mountThumbUrl: POLARIS_OPERATOR_MOUNT_GO2_EDU_URL,
    mountValue: "D1-T",
    mountThumbHref: "https://www.unitree.com/D1-T",
  },
  {
    id: "as2",
    title: "Unitree AS2",
    category: { label: "Type", value: "Quadruped" },
    location: "—",
    task: "—",
    active: "blue",
    imageUrl: POLARIS_AS2_PREVIEW_URL,
    imageAlt: "Unitree AS2 robot",
    mountThumbUrl: null,
  },
  {
    id: "a2",
    title: "Unitree A2",
    titleHref: "https://www.unitree.com/A2",
    category: { label: "Type", value: "Industrial quadruped" },
    location: "—",
    task: "—",
    active: "blue",
    imageUrl: POLARIS_A2_PREVIEW_URL,
    imageAlt: "Unitree A2 robot",
    mountThumbUrl: null,
  },
];

export default function PolarisPage(): React.ReactElement {
  const [hoveredOperatorId, setHoveredOperatorId] = React.useState<string | null>(null);
  const [povRefreshKey, setPovRefreshKey] = React.useState(0);

  React.useEffect(() => {
    if (hoveredOperatorId === null) {
      return;
    }
    const op = OPERATOR_CARDS.find((c) => c.id === hoveredOperatorId);
    if (!op?.slamassPovOnHover) {
      return;
    }
    const id = window.setInterval(() => {
      setPovRefreshKey((k) => k + 1);
    }, 800);
    return () => clearInterval(id);
  }, [hoveredOperatorId]);

  return (
    <PolarisLayout>
      <main className="polaris-operators-main min-h-[calc(100vh-7rem)] bg-white px-4 py-8 sm:px-8 sm:py-10">
        <div className="polaris-operators-inner polaris-fade-stagger polaris-fade-stagger--operators mx-auto w-full max-w-3xl">
          <div className="polaris-operators-page-head">
            <h1 className="polaris-operators-page-title" data-testid="polaris-operators-heading">
              Operators
            </h1>
            <a
              className="polaris-operators-add-button"
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
            {OPERATOR_CARDS.map((op) => (
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
                        op.slamassPovOnHover ? (
                          <div
                            className="polaris-operator-card-pov-hit"
                            onMouseEnter={() => {
                              setHoveredOperatorId(op.id);
                              setPovRefreshKey((k) => k + 1);
                            }}
                            onMouseLeave={() => setHoveredOperatorId(null)}
                          >
                            <img
                              alt={
                                hoveredOperatorId === op.id
                                  ? ""
                                  : op.imageAlt
                              }
                              aria-hidden={hoveredOperatorId === op.id ? true : undefined}
                              className="polaris-operator-card-img polaris-operator-card-img--static"
                              decoding="async"
                              src={op.imageUrl}
                            />
                            {hoveredOperatorId === op.id ? (
                              <img
                                alt={`Live camera — ${op.imageAlt}`}
                                className="polaris-operator-card-img polaris-operator-card-img--live"
                                decoding="async"
                                key={povRefreshKey}
                                src={apiUrl(`/api/pov/latest.jpg?v=${povRefreshKey}`)}
                              />
                            ) : null}
                          </div>
                        ) : (
                          <img
                            alt={op.imageAlt}
                            className="polaris-operator-card-img polaris-operator-card-img--static"
                            decoding="async"
                            src={op.imageUrl}
                          />
                        )
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
                    <a className="polaris-operator-card-cta" href="/polaris/configurator">
                      <span className="polaris-operator-card-cta-label">Configurator</span>
                      <span aria-hidden className="polaris-operator-card-cta-icon">
                        ↗
                      </span>
                    </a>
                    {op.mountThumbUrl ? (
                      <div className="polaris-operator-card-manipulator-row">
                        {op.mountThumbHref ? (
                          <a
                            aria-label={
                              op.mountValue
                                ? `Unitree ${op.mountValue} product page`
                                : "Mount product page"
                            }
                            className="polaris-operator-card-mount-thumb-link"
                            href={op.mountThumbHref}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <span className="polaris-operator-card-select-thumb">
                              <img
                                alt=""
                                className="polaris-operator-card-select-thumb-img"
                                decoding="async"
                                src={op.mountThumbUrl}
                              />
                            </span>
                          </a>
                        ) : (
                          <div aria-hidden className="polaris-operator-card-select-thumb">
                            <img
                              alt=""
                              className="polaris-operator-card-select-thumb-img"
                              decoding="async"
                              src={op.mountThumbUrl}
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
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
