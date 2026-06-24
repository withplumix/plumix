import type { ReactElement } from "react";
import { createElement } from "react";

// Inline-styled because this renders inside the canvas iframe, which carries the
// theme's CSS, not admin-ui's. Theme-agnostic muted gray so it reads as editor
// chrome on any background. `currentColor` is avoided for the same reason.
const STYLE: Record<string, string> = {
  display: "flex",
  width: "100%",
  boxSizing: "border-box",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "3rem",
  padding: "0.75rem 1rem",
  border: "1px dashed rgba(127,127,127,0.45)",
  borderRadius: "8px",
  color: "rgba(127,127,127,0.95)",
  background: "transparent",
  font: "inherit",
  fontSize: "0.875rem",
  cursor: "pointer",
};

/**
 * Edit-mode "Add a block" affordance, rendered in the canvas content flow — for
 * an empty root document or an empty child slot. It carries data attributes the
 * canvas click-delegation turns into an add-intent; it has no event handler so
 * the renderer stays pure (the same code string-renders for SSR, where this is
 * never emitted because it's edit-only). `target` identifies an empty slot;
 * omit it for the root document. `label` is the localized text — resolved by
 * the host (which owns Lingui) and threaded in, since the canvas has no i18n
 * runtime; it falls back to English when the host hasn't pushed config yet.
 */
export function editAppender(
  target?: {
    readonly parentId: string;
    readonly slotKey: string;
  },
  label = "Add a block",
): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      "data-plumix-add": "",
      ...(target && {
        "data-plumix-add-parent": target.parentId,
        "data-plumix-add-slot": target.slotKey,
      }),
      style: STYLE,
    },
    label,
  );
}
