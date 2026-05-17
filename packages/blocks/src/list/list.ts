import { defineBlock } from "../define-block.js";

export const listBlock = defineBlock({
  name: "core/list",
  title: "Bulleted list",
  category: "text",
  description: "Unordered list of items.",
  legacyAliases: ["bulletList"],
  keyboardShortcuts: [{ shortcut: "Mod-Alt-L", mode: "wrap" }],
  markdownShortcuts: [{ pattern: "- ", mode: "wrap" }],
  parsePaste: [{ selector: "ul" }],
  transforms: {
    priority: 20,
    to: [{ target: "core/paragraph" }],
  },
  schema: () => import("./schema.js").then((m) => m.listSchema),
  component: () => import("./Component.js").then((m) => m.ListComponent),
});
