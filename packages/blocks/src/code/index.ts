import { defineBlock } from "../define-block.js";

export const codeBlock = defineBlock({
  name: "core/code",
  title: "Code",
  category: "typography",
  description: "Preformatted code block with optional language attribute.",
  keyboardShortcuts: [{ shortcut: "Mod-Alt-C" }],
  markdownShortcuts: [{ pattern: "``` " }],
  parsePaste: [{ selector: "pre" }],
  transforms: {
    priority: 20,
    to: [{ target: "core/paragraph" }],
  },
  schema: () => import("./schema.js").then((m) => m.codeSchema),
  component: () => import("./Component.js").then((m) => m.CodeComponent),
});
