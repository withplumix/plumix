import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const GAPS = ["sm", "md", "lg"] as const;
type Gap = (typeof GAPS)[number];

function pickGap(raw: unknown): Gap {
  return typeof raw === "string" && (GAPS as readonly string[]).includes(raw)
    ? (raw as Gap)
    : "md";
}

export const columnsBlock = defineBlock({
  name: "core/columns",
  title: "Columns",
  icon: "Columns",
  category: "layout",
  inputs: [
    {
      name: "gap",
      type: "select",
      label: "Gap",
      options: GAPS.map((v) => ({ label: v, value: v })),
    },
    { name: "left", type: "slot", label: "Left column" },
    { name: "right", type: "slot", label: "Right column" },
  ],
  defaults: { gap: "md" },
  render: ({ attrs }): ReactNode => {
    const gap = pickGap(attrs.gap);
    const Left = attrs.left as (() => ReactNode) | undefined;
    const Right = attrs.right as (() => ReactNode) | undefined;
    return (
      <div data-plumix-columns data-gap={gap}>
        <div data-plumix-column="left">{Left ? <Left /> : null}</div>
        <div data-plumix-column="right">{Right ? <Right /> : null}</div>
      </div>
    );
  },
});
