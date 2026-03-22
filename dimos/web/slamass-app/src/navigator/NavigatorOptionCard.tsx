import React from "react";

export type NavigatorOptionCardProps = {
  kicker: string;
  title: string;
  description?: string;
  /** Chips or controls aligned to the right of the title row */
  headerAside?: React.ReactNode;
  children: React.ReactNode;
  /** Taller scroll region for dense content (e.g. operator rail) */
  bodyVariant?: "default" | "scroll";
  className?: string;
};

/**
 * Refined option “box” for the Polaris navigator sidebar (Configurator-style chrome).
 */
export function NavigatorOptionCard(
  props: NavigatorOptionCardProps,
): React.ReactElement {
  const {
    kicker,
    title,
    description,
    headerAside,
    children,
    bodyVariant = "default",
    className,
  } = props;

  return (
    <section
      className={["polaris-nav-option-card", className].filter(Boolean).join(" ")}
    >
      <header className="polaris-nav-option-card-header">
        <div className="polaris-nav-option-card-head-main">
          <p className="polaris-nav-option-card-kicker">{kicker}</p>
          <h2 className="polaris-nav-option-card-title">{title}</h2>
          {description ? (
            <p className="polaris-nav-option-card-desc">{description}</p>
          ) : null}
        </div>
        {headerAside ? (
          <div className="polaris-nav-option-card-head-aside">{headerAside}</div>
        ) : null}
      </header>
      <div
        className={
          bodyVariant === "scroll"
            ? "polaris-nav-option-card-body polaris-nav-option-card-body--scroll"
            : "polaris-nav-option-card-body"
        }
      >
        {children}
      </div>
    </section>
  );
}
