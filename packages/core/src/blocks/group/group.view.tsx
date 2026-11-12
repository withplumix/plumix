import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

export default function GroupView({
  attrs,
  blockProps,
  tagName,
}: BlockViewProps): ReactNode {
  const Content = attrs.content as (() => ReactNode) | undefined;
  // Honor the author's root-element override (Builder's tag-name); the Box is
  // a generic container, so div/section/nav/etc are all valid.
  const Tag = tagName ?? "div";
  return <Tag {...blockProps}>{Content ? <Content /> : null}</Tag>;
}
