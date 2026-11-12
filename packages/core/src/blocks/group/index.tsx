import { defineBlock } from "../block-registry.js";

export const groupBlock = defineBlock({
  name: "core/group",
  title: { id: "block.core.group.title", message: "Box" },
  icon: "Box",
  category: "layout",
  // Author layout styles land on the box's own div so its slot children are the
  // flex/grid items; there is no `layout` prop, like Builder's Box.
  selfSeam: true,
  inputs: [
    {
      name: "content",
      type: "slot",
      label: { id: "block.core.group.input.content.label", message: "Content" },
    },
  ],
  view: () => import("./group.view.js"),
});
