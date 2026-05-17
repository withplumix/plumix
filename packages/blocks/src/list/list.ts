import { defineBlock } from "../define-block.js";

export const listBlock = defineBlock({
  name: "core/list",
  title: "Bulleted list",
  category: "text",
  description: "Unordered list of items.",
  legacyAliases: ["bulletList"],
  schema: () => import("./schema.js").then((m) => m.listSchema),
  component: () => import("./Component.js").then((m) => m.ListComponent),
});
