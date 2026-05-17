import { defineBlock } from "../define-block.js";

export const calloutBlock = defineBlock({
  name: "core/callout",
  title: "Callout",
  category: "interactive",
  description: "Highlighted aside for info / warning / error / success / note.",
  schema: () => import("./schema.js").then((m) => m.calloutSchema),
  component: () => import("./Component.js").then((m) => m.CalloutComponent),
});
