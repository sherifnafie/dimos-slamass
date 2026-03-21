import React from "react";

type PanelShellProps = {
  kicker?: string;
  title?: string;
  aside?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

export function PanelShell(props: PanelShellProps): React.ReactElement {
  const { kicker, title, aside, footer, className, bodyClassName, children } = props;
  const hasHeaderCopy = Boolean(kicker) || Boolean(title);

  return (
    <section className={["panel-shell", className].filter(Boolean).join(" ")}>
      <div className="panel-shell-glow" />
      <header className="panel-header">
        {hasHeaderCopy ? (
          <div className="panel-header-copy">
            {kicker ? <p className="panel-kicker">{kicker}</p> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
        ) : null}
        {aside ? <div className="panel-header-aside">{aside}</div> : null}
      </header>
      <div className={["panel-body", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      {footer ? <footer className="panel-footer">{footer}</footer> : null}
    </section>
  );
}
