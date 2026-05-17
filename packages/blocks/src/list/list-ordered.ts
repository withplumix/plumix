import { defineBlock } from "../define-block.js";

export const listOrderedBlock = defineBlock({
  name: "core/list-ordered",
  title: "Numbered list",
  category: "text",
  description: "Ordered list of items.",
  legacyAliases: ["orderedList"],
  keyboardShortcuts: [{ shortcut: "Mod-Alt-O", mode: "wrap" }],
  markdownShortcuts: [{ pattern: "1. ", mode: "wrap" }],
  parsePaste: [{ selector: "ol" }],
  schema: () => import("./schema.js").then((m) => m.listOrderedSchema),
  component: () => import("./Component.js").then((m) => m.ListOrderedComponent),
});
