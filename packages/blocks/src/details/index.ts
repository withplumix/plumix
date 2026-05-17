import { defineBlock } from "../define-block.js";

export const detailsBlock = defineBlock({
  name: "core/details",
  title: "Details",
  category: "interactive",
  description: "Native <details>/<summary> collapsible region.",
  schema: () => import("./schema.js").then((m) => m.detailsSchema),
  component: () => import("./Component.js").then((m) => m.DetailsComponent),
});
