import { defineBlock } from "../define-block.js";

export const buttonBlock = defineBlock({
  name: "core/button",
  title: "Button",
  category: "interactive",
  description: "Call-to-action link styled as a button.",
  schema: () => import("./schema.js").then((m) => m.buttonSchema),
  component: () => import("./Component.js").then((m) => m.ButtonComponent),
});
