import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const DEFAULT_HEIGHT = 24;

function pickHeight(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_HEIGHT;
  }
  return raw;
}

export const spacerBlock = defineBlock({
  name: "core/spacer",
  title: "Spacer",
  icon: "Minus",
  category: "layout",
  inputs: [{ name: "height", type: "number", label: "Height (px)" }],
  defaults: { height: DEFAULT_HEIGHT },
  render: ({ attrs }): ReactNode => {
    const height = pickHeight(attrs.height);
    return <div aria-hidden="true" style={{ height: `${height}px` }} />;
  },
});
