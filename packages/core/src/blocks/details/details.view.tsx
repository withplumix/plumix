import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

const DEFAULT_SUMMARY = "Details";

export default function DetailsView({ attrs }: BlockViewProps): ReactNode {
  const summaryRaw = attrs.summary as string | undefined;
  const summary =
    typeof summaryRaw === "string" && summaryRaw.length > 0
      ? summaryRaw
      : DEFAULT_SUMMARY;
  const open = attrs.open === true;
  const Content = attrs.content as (() => ReactNode) | undefined;
  return (
    <details open={open}>
      <summary>{summary}</summary>
      {Content ? <Content /> : null}
    </details>
  );
}
