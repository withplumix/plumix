import { defineBlock } from "../define-block.js";

export const groupBlock = defineBlock({
  name: "core/group",
  title: "Group",
  category: "layout",
  description: "Generic container that hosts any block-level children.",
  schema: () => import("./schema.js").then((m) => m.groupSchema),
  component: () => import("./Component.js").then((m) => m.GroupComponent),
});
