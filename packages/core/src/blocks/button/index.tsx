import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 && SAFE_HREF.test(trimmed) ? trimmed : undefined;
}

export const buttonBlock = defineBlock({
  name: "core/button",
  title: { id: "block.core.button.title", message: "Button" },
  icon: "MousePointerClick",
  category: "interactive",
  // A wrapping `<div>` would carry the same class and id, double-applying the
  // button styles and giving the selection overlay two elements.
  selfSeam: true,
  inputs: [
    {
      name: "label",
      type: "text",
      label: { id: "block.core.button.input.label.label", message: "Label" },
    },
    {
      name: "href",
      type: "text",
      label: { id: "block.core.button.input.href.label", message: "Href" },
    },
    {
      name: "openInNewTab",
      type: "boolean",
      label: {
        id: "block.core.button.input.openInNewTab.label",
        message: "Open in new tab",
      },
    },
  ],
  text: [{ name: "label", prose: false }],
  defaults: { label: "Click" },
  // The `var(--plumix-button-*, fallback)` form renders out of the box and lets
  // a theme restyle every button by defining the variable.
  defaultStyles: {
    large: {
      display: "inline-block",
      appearance: "none",
      cursor: "pointer",
      textAlign: "center",
      textDecoration: "none",
      paddingTop: "var(--plumix-button-padding-y, 0.5rem)",
      paddingBottom: "var(--plumix-button-padding-y, 0.5rem)",
      paddingLeft: "var(--plumix-button-padding-x, 1rem)",
      paddingRight: "var(--plumix-button-padding-x, 1rem)",
      borderRadius: "var(--plumix-button-radius, 0.375rem)",
      backgroundColor: "var(--plumix-button-bg, #111827)",
      color: "var(--plumix-button-fg, #f9fafb)",
    },
  },
  render: ({ attrs, blockProps }): ReactNode => {
    const label = typeof attrs.label === "string" ? attrs.label : "";
    const href = sanitizeHref(attrs.href);
    const newTab = attrs.openInNewTab === true;
    if (href) {
      return (
        <a
          href={href}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          {...blockProps}
        >
          {label}
        </a>
      );
    }
    return (
      <button type="button" {...blockProps}>
        {label}
      </button>
    );
  },
});
