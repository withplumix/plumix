import type { CSSProperties, ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

export default function SectionView({
  attrs,
  blockProps,
}: BlockViewProps): ReactNode {
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
}
