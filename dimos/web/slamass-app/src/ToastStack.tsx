import React from "react";

type ToastTone = "neutral" | "accent" | "success" | "danger";

export type ToastEntry = {
  id: string;
  tone: ToastTone;
  title: string;
  detail: string;
};

type ToastStackProps = {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
};

export function ToastStack(props: ToastStackProps): React.ReactElement | null {
  const { toasts, onDismiss } = props;

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="toast-stack" role="status">
      {toasts.map((toast) => (
        <article className={`toast-card tone-${toast.tone}`} key={toast.id}>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            <p>{toast.detail}</p>
          </div>
          <button
            aria-label={`Dismiss ${toast.title}`}
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            Close
          </button>
        </article>
      ))}
    </div>
  );
}
