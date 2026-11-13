import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

export default function GroupView({
  attrs,
  blockProps,
  tagName,
}: BlockViewProps): ReactNode {
  const Content = attrs.content as (() => ReactNode) | undefined;
  const Tag = tagName ?? "div";
  return <Tag {...blockProps}>{Content ? <Content /> : null}</Tag>;
}
