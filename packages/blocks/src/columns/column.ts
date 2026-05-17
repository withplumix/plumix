import { defineBlock } from "../define-block.js";

export const columnBlock = defineBlock({
  name: "core/column",
  title: "Column",
  category: "layout",
  description: "Single column inside a columns container.",
  attributes: {
    // Free-form so authors can express CSS lengths (`33%`, `1fr`, `20rem`)
    // — the parent columns ratio drives the default layout; this is the
    // override knob for one-off column sizing.
    width: { type: "text", label: "Width", default: "" },
  },
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.columnSchema),
  component: () => import("./Component.js").then((m) => m.ColumnComponent),
});
