import { defineBlock } from "../block-registry.js";

export const richTextBlock = defineBlock({
  name: "core/rich-text",
  title: { id: "block.core.rich-text.title", message: "Rich text" },
  icon: "Type",
  category: "text",
  // Authors still mentally call this "paragraph" — the catalog search
  // matches name/title/keywords, so it needs an explicit hook to find
  // rich-text after the legacy paragraph block was removed in #473.
  keywords: [
    { id: "block.core.rich-text.keyword.paragraph", message: "paragraph" },
    { id: "block.core.rich-text.keyword.text", message: "text" },
    { id: "block.core.rich-text.keyword.body", message: "body" },
  ],
  inputs: [
    {
      name: "body",
      type: "richtext",
      content: true,
      label: { id: "block.core.rich-text.input.body.label", message: "Body" },
    },
  ],
  text: [{ name: "body", html: true }],
  defaults: { body: "<p>Enter text here…</p>" },
  view: () => import("./rich-text.view.js"),
});
