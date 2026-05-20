import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const DEFAULT_SUMMARY = "Details";

export const detailsBlock = defineBlock({
  name: "core/details",
  title: "Details",
  icon: "ChevronDown",
  category: "layout",
  inputs: [
    { name: "summary", type: "text", label: "Summary" },
    { name: "open", type: "checkbox", label: "Open by default" },
    { name: "content", type: "slot", label: "Content" },
  ],
  defaults: { summary: "", open: false },
  render: ({ attrs }): ReactNode => {
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
  },
});
