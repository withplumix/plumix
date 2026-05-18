import { defineBlock } from "../define-block.js";

export const spacerBlock = defineBlock({
  name: "core/spacer",
  title: "Spacer",
  icon: "ArrowDownUp",
  category: "typography",
  description: "Vertical whitespace with adjustable height.",
  schema: () => import("./schema.js").then((m) => m.spacerSchema),
  component: () => import("./Component.js").then((m) => m.SpacerComponent),
});
