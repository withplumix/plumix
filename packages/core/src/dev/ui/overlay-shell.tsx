/// <reference lib="dom" />
// The shared dev-overlay shell (#1678). One modal-over-dimmed-backdrop primitive
// (the Next.js dev-overlay shape) that both client dev surfaces compose: the
// compile-error overlay and the island error dialog. It owns the backdrop, the
// centered card, the title bar (a label, an optional actions slot, a close
// button), and the scrollable body — nothing surface-specific. Each consumer
// mounts it inside its own Shadow DOM root and pairs {@link DEV_OVERLAY_CSS} with
// the shared token sheet, so the two overlays read identically without
// duplicating the chrome.

import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";

/**
 * The modal shell. Renders {@link label} at the left of the title bar, an
 * optional {@link actions} slot (e.g. the island dialog's prev/next nav) before
 * a close button, and {@link children} in the scrollable body. Closing is driven
 * by {@link onClose} — fired by the close button, Escape (owned by the consumer),
 * and a backdrop press-and-release that both began and ended on the backdrop, so
 * a text selection dragged out of the modal never dismisses it.
 */
export function DevOverlayShell({
  label,
  ariaLabel,
  onClose,
  actions,
  children,
}: {
  /** The title-bar label — the compile surface's static title, the island's name. */
  readonly label: ReactNode;
  /** The dialog's accessible name. */
  readonly ariaLabel: string;
  readonly onClose: () => void;
  /** Optional title-bar controls, rendered between the label and the close button. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const pressedBackdrop = useRef(false);
  return (
    <div
      className="plumix-dev-overlay__backdrop"
      data-testid="plumix-dev-overlay-backdrop"
      onMouseDown={(event) => {
        // A backdrop `click` fires on the common ancestor of press + release, so
        // a text selection that starts inside the modal and ends on the backdrop
        // would otherwise close it. Only close when the press began here too.
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedBackdrop.current) {
          onClose();
        }
      }}
    >
      <div
        className="plumix-dev-overlay__modal"
        data-testid="plumix-dev-overlay-panel"
        role="dialog"
        aria-label={ariaLabel}
      >
        <div className="plumix-dev-overlay__bar">
          <span
            className="plumix-dev-overlay__label"
            data-testid="plumix-dev-overlay-label"
          >
            {label}
          </span>
          {actions}
          <button
            type="button"
            className="plumix-dev-overlay__btn"
            data-testid="plumix-dev-overlay-close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="plumix-dev-overlay__body">{children}</div>
      </div>
    </div>
  );
}

// The shell chrome — a centered modal over a dimmed backdrop, inside a Shadow
// DOM root. Paired with the shared token sheet (`DEV_ERROR_CSS`) by each
// consumer; this sheet styles only the shell and its body's dev-error overrides
// (the modal caps the page's full-viewport metrics and wraps long lines that the
// wide server page keeps on one line). The `__nav`/`__count` classes style the
// island dialog's optional bar actions, passed in through `actions`. The palette
// lives on `:host` (custom properties are exempt from `all: initial`) so it
// inherits shadow-wide — the island dialog's bottom-left badge reuses it without
// redeclaring the tokens.
export const DEV_OVERLAY_CSS = `
:host {
  all: initial;
  --plumix-ov-bg: #16181d;
  --plumix-ov-surface: #1e2128;
  --plumix-ov-fg: #e6e8eb;
  --plumix-ov-muted: #9aa0aa;
  --plumix-ov-accent: #ff6b6b;
  --plumix-ov-border: #2c3038;
  --plumix-ov-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  font-family: var(--plumix-ov-font);
}

.plumix-dev-overlay__backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1rem, 5vh, 3rem) clamp(1rem, 5vw, 3rem);
  background: rgba(0, 0, 0, 0.5);
}

.plumix-dev-overlay__modal {
  display: flex;
  flex-direction: column;
  width: min(44rem, 100%);
  max-height: 100%;
  background: var(--plumix-ov-bg);
  border: 1px solid var(--plumix-ov-border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.plumix-dev-overlay__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--plumix-ov-border);
  background: var(--plumix-ov-surface);
}

.plumix-dev-overlay__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--plumix-ov-fg);
}

.plumix-dev-overlay__nav {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.plumix-dev-overlay__count {
  min-width: 2.5rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--plumix-ov-muted);
  font-variant-numeric: tabular-nums;
}

.plumix-dev-overlay__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.375rem;
  background: transparent;
  color: var(--plumix-ov-muted);
  border: 1px solid var(--plumix-ov-border);
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1;
  cursor: pointer;
}

.plumix-dev-overlay__btn:hover {
  color: var(--plumix-ov-fg);
  border-color: var(--plumix-ov-accent);
}

.plumix-dev-overlay__body {
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--plumix-ov-border) transparent;
}

.plumix-dev-overlay__body .plumix-dev-error {
  min-height: 0;
  padding: 1.25rem;
}

/* In the modal, wrap long stack lines instead of a jarring horizontal
   scrollbar (the full-width server page keeps them on one line). */
.plumix-dev-overlay__body .plumix-dev-error__stack pre,
.plumix-dev-overlay__body .plumix-dev-error__component-stack-pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-x: visible;
}

/* Give the code excerpt the room — a ~30/70 split in the modal, versus the
   wide server page where a fixed frame column reads better. Gated on the same
   width as the shared two-column rule so narrow viewports still stack. */
@media (min-width: 60rem) {
  .plumix-dev-overlay__body .plumix-dev-error__frames {
    grid-template-columns: minmax(0, 3fr) minmax(0, 7fr);
  }
}
`;
