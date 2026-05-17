import { defineBlock } from "../define-block.js";

export const listItemBlock = defineBlock({
  name: "core/list-item",
  title: "List item",
  category: "text",
  description: "Single entry inside a bulleted or numbered list.",
  legacyAliases: ["listItem"],
  schema: () => import("./schema.js").then((m) => m.listItemSchema),
  component: () => import("./Component.js").then((m) => m.ListItemComponent),
});
