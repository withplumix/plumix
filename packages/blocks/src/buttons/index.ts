import { defineBlock } from "../define-block.js";

export const buttonsBlock = defineBlock({
  name: "core/buttons",
  title: "Buttons",
  category: "interactive",
  description: "Container for a row of call-to-action buttons.",
  schema: () => import("./schema.js").then((m) => m.buttonsSchema),
  component: () => import("./Component.js").then((m) => m.ButtonsComponent),
});
