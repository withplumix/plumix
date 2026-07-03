import type { CSSProperties, ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const sectionBlock = defineBlock({
  name: "core/section",
  title: "Section",
  icon: "RectangleHorizontal",
  category: "layout",
  // selfSeam so the full-bleed styles + block class land on the `<section>`
  // itself (not a wrapper div), and the centered inner sits inside it.
  selfSeam: true,
  inputs: [
    { name: "maxWidth", type: "text", label: "Content max width" },
    {
      name: "content",
      type: "slot",
      label: "Content",
      defaultChildren: [{ id: "section-text", name: "core/rich-text" }],
    },
  ],
  defaults: { maxWidth: "1200px" },
  // Full-bleed band: the section spans the viewport while its content stays
  // centered at maxWidth. Seeded as editable Styles values, not baked CSS, so a
  // theme or author can tune the padding/width.
  defaultStyles: {
    large: {
      width: "100vw",
      marginLeft: "calc(50% - 50vw)",
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
