import { defineBlock } from "../block-registry.js";

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
      content: true,
      label: { id: "block.core.button.input.label.label", message: "Label" },
    },
    {
      name: "href",
      type: "text",
      content: true,
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
  view: () => import("./button.view.js"),
});
