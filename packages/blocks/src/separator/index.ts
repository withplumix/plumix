import { defineBlock } from "../define-block.js";

export const separatorBlock = defineBlock({
  name: "core/separator",
  title: "Separator",
  icon: "Minus",
  category: "typography",
  description: "Horizontal rule with named style variants.",
  legacyAliases: ["horizontalRule"],
  markdownShortcuts: [{ pattern: "--- ", mode: "leaf" }],
  parsePaste: [{ selector: "hr" }],
  schema: () => import("./schema.js").then((m) => m.separatorSchema),
  component: () => import("./Component.js").then((m) => m.SeparatorComponent),
});
