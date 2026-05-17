import { defineBlock } from "../define-block.js";

export const quoteBlock = defineBlock({
  name: "core/quote",
  title: "Quote",
  category: "typography",
  description: "Pull quote with optional citation.",
  keyboardShortcuts: [{ shortcut: "Mod-Alt-Q" }],
  markdownShortcuts: [{ pattern: "> " }],
  parsePaste: [{ selector: "blockquote" }],
  schema: () => import("./schema.js").then((m) => m.quoteSchema),
  component: () => import("./Component.js").then((m) => m.QuoteComponent),
});
