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
  render: ({ attrs, blockProps }): ReactNode => {
    const Content = attrs.content as (() => ReactNode) | undefined;
    return <div {...blockProps}>{Content ? <Content /> : null}</div>;
  },
});
