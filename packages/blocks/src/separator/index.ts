import { defineBlock } from "../define-block.js";

export const separatorBlock = defineBlock({
  name: "core/separator",
  title: "Separator",
  category: "typography",
  description: "Horizontal rule with named style variants.",
  schema: () => import("./schema.js").then((m) => m.separatorSchema),
  component: () => import("./Component.js").then((m) => m.SeparatorComponent),
});
