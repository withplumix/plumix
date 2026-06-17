import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const ALIGNS = ["start", "center", "end", "between"] as const;
type Align = (typeof ALIGNS)[number];

function pickAlign(raw: unknown): Align {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as Align)
    : "start";
}

function normalizeGap(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return `${raw}px`;
  }
  if (typeof raw === "string" && raw.length > 0) return raw;
  return undefined;
}

export const buttonsBlock = defineBlock({
  name: "core/buttons",
  title: "Buttons",
  icon: "MousePointerClick",
  category: "interactive",
  inputs: [
    {
      name: "align",
      type: "select",
      label: "Align",
      options: ALIGNS.map((a) => ({ label: a, value: a })),
    },
    { name: "gap", type: "text", label: "Gap" },
    {
      name: "items",
      type: "slot",
      label: "Buttons",
      allowedBlocks: ["core/button"],
    },
  ],
  defaults: { align: "start" },
  render: ({ attrs }): ReactNode => {
    const align = pickAlign(attrs.align);
    const gap = normalizeGap(attrs.gap);
    const Items = attrs.items as (() => ReactNode) | undefined;
    return (
      <div data-align={align} data-gap={gap}>
        {Items ? <Items /> : null}
      </div>
    );
  },
});
