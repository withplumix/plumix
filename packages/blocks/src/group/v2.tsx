import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const LAYOUTS = ["flow", "flex-row", "flex-column", "grid"] as const;
type GroupLayout = (typeof LAYOUTS)[number];

function pickLayout(raw: unknown): GroupLayout {
  return typeof raw === "string" && (LAYOUTS as readonly string[]).includes(raw)
    ? (raw as GroupLayout)
    : "flow";
}

export const groupBlockV2 = defineBlock({
  name: "core/group",
  title: "Group",
  icon: "Group",
  category: "layout",
  inputs: [
    {
      name: "layout",
      type: "select",
      label: "Layout",
      options: LAYOUTS.map((v) => ({ label: v, value: v })),
    },
    { name: "content", type: "slot", label: "Content" },
  ],
  defaults: { layout: "flow" },
  render: ({ attrs }): ReactNode => {
    const layout = pickLayout(attrs.layout);
    const Content = attrs.content as (() => ReactNode) | undefined;
    return (
      <div data-layout={layout}>{Content ? <Content /> : null}</div>
    );
  },
});
