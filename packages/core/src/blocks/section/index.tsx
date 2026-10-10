import type { CSSProperties, ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const sectionBlock = defineBlock({
  name: "core/section",
  title: { id: "block.core.section.title", message: "Section" },
  icon: "LayoutTemplate",
  category: "layout",
  // selfSeam so the seeded styles + block class land on the `<section>` itself
  // (not a wrapper div), and the centered inner sits inside it.
  selfSeam: true,
  inputs: [
    {
      name: "maxWidth",
      type: "text",
      label: {
        id: "block.core.section.input.maxWidth.label",
        message: "Content max width",
      },
    },
    {
      name: "content",
      type: "slot",
      label: {
        id: "block.core.section.input.content.label",
        message: "Content",
      },
      defaultChildren: [{ id: "section-text", name: "core/rich-text" }],
    },
  ],
  defaults: { maxWidth: "1200px" },
  // Not `width: 100vw` full-bleed by default: it overflows by the scrollbar's
  // width unless an ancestor clips the x-axis, adding a horizontal scrollbar.
  defaultStyles: {
    large: {
      paddingTop: "3rem",
      paddingBottom: "3rem",
      paddingLeft: "1.25rem",
      paddingRight: "1.25rem",
    },
  },
  render: ({ attrs, blockProps }): ReactNode => {
    const maxWidth =
      typeof attrs.maxWidth === "string" && attrs.maxWidth !== ""
        ? attrs.maxWidth
        : "1200px";
    const Content = attrs.content as (() => ReactNode) | undefined;
    const inner: CSSProperties = { maxWidth, marginInline: "auto" };
    return (
      <section {...blockProps}>
        <div data-plumix-section-inner="" style={inner}>
          {Content ? <Content /> : null}
        </div>
      </section>
    );
  },
});
