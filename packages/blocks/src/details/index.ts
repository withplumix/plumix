import { defineBlock } from "../define-block.js";

export const detailsBlock = defineBlock({
  name: "core/details",
  title: "Details",
  icon: "ChevronDownSquare",
  category: "interactive",
  description: "Native <details>/<summary> collapsible region.",
  attributes: {
    summary: { type: "text", label: "Summary", default: "" },
    open: { type: "boolean", label: "Open by default", default: false },
  },
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.detailsSchema),
  component: () => import("./Component.js").then((m) => m.DetailsComponent),
});
