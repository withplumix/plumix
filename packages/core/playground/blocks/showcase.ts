import { defineBlock } from "plumix/blocks";

export const showcaseBlock = defineBlock({
  name: "playground/showcase",
  title: "Showcase",
  icon: "Sparkles",
  category: "text",
  inputs: [{ name: "authorId", type: "number", label: "Author ID" }],
  view: () => import("./showcase.view.js"),
});
