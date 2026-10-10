import type { ReactNode } from "react";

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
  render: ({ attrs, blockProps, tagName }): ReactNode => {
    const Content = attrs.content as (() => ReactNode) | undefined;
    // Honor the author's root-element override (Builder's tag-name); the Box is
    // a generic container, so div/section/nav/etc are all valid.
    const Tag = tagName ?? "div";
    return <Tag {...blockProps}>{Content ? <Content /> : null}</Tag>;
  },
});
