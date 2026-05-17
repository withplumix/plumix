import { defineBlock } from "../define-block.js";

export const codeBlock = defineBlock({
  name: "core/code",
  title: "Code",
  category: "typography",
  description: "Preformatted code block with optional language attribute.",
  schema: () => import("./schema.js").then((m) => m.codeSchema),
  component: () => import("./Component.js").then((m) => m.CodeComponent),
});
