import { defineBlock } from "../block-registry.js";

export const detailsBlock = defineBlock({
  name: "core/details",
  title: { id: "block.core.details.title", message: "Details" },
  icon: "ChevronDown",
  category: "layout",
  inputs: [
    {
      name: "summary",
      type: "text",
      content: true,
      label: {
        id: "block.core.details.input.summary.label",
        message: "Summary",
      },
    },
    {
      name: "open",
      type: "checkbox",
      label: {
        id: "block.core.details.input.open.label",
        message: "Open by default",
      },
    },
    {
      name: "content",
      type: "slot",
      label: {
        id: "block.core.details.input.content.label",
        message: "Content",
      },
    },
  ],
  text: [{ name: "summary" }],
  defaults: { summary: "", open: false },
  view: () => import("./details.view.js"),
});
