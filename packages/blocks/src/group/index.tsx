import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const groupBlock = defineBlock({
  name: "core/group",
  title: "Box",
  icon: "Box",
  category: "layout",
  // selfSeam so the block class (author styles: display/flex/gap set in the
  // Styles tab's Layout section) lands on the box's own div, making its slot
  // children the flex/grid items. An unopinionated container — no `layout`
  // prop; every layout decision is a style, like Builder's Box.
  selfSeam: true,
  inputs: [{ name: "content", type: "slot", label: "Content" }],
  render: ({ attrs, blockProps, tagName }): ReactNode => {
    const Content = attrs.content as (() => ReactNode) | undefined;
    // Honor the author's root-element override (Builder's tag-name); the Box is
    // a generic container, so div/section/nav/etc are all valid.
    const Tag = tagName ?? "div";
    return <Tag {...blockProps}>{Content ? <Content /> : null}</Tag>;
  },
});
