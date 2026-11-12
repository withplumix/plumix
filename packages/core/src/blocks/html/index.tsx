import { defineBlock } from "../block-registry.js";

export const htmlBlock = defineBlock({
  name: "core/html",
  title: { id: "block.core.html.title", message: "HTML" },
  icon: "Code",
  category: "interactive",
  description: {
    id: "block.core.html.description",
    message: "Raw markup, sanitized against the allowlist before it renders.",
  },
  keywords: [
    { id: "block.core.html.keyword.raw", message: "raw" },
    { id: "block.core.html.keyword.markup", message: "markup" },
    { id: "block.core.html.keyword.embed-code", message: "embed code" },
  ],
  inputs: [
    {
      name: "html",
      type: "textarea",
      label: { id: "block.core.html.input.html.label", message: "HTML" },
    },
  ],
  // A raw-HTML block may hold a widget rather than writing.
  text: [{ name: "html", html: true, prose: false }],
  defaults: { html: "<p>Custom HTML</p>" },
  view: () => import("./html.view.js"),
});
