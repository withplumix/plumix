import { defineBlock } from "plumix/blocks";

/**
 * Whose view module brings what a theme block's does: a stylesheet, an island
 * and a loader that reads a table. None of it loads with the definition.
 */
export const showcaseBlock = defineBlock({
  name: "playground/showcase",
  title: "Showcase",
  icon: "Sparkles",
  category: "text",
  inputs: [{ name: "authorId", type: "number", label: "Author ID" }],
  view: () => import("./showcase.view.js"),
});
