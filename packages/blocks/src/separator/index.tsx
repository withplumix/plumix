import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const VARIANTS = ["solid", "dashed", "dotted", "wide"] as const;
type SeparatorVariant = (typeof VARIANTS)[number];

function pickVariant(raw: unknown): SeparatorVariant {
  return typeof raw === "string" && (VARIANTS as readonly string[]).includes(raw)
    ? (raw as SeparatorVariant)
    : "solid";
}

export const separatorBlock = defineBlock({
  name: "core/separator",
  title: "Separator",
  icon: "Minus",
  category: "text",
  inputs: [
    {
      name: "variant",
      type: "select",
      label: "Variant",
      options: VARIANTS.map((v) => ({ label: v, value: v })),
    },
  ],
  defaults: { variant: "solid" },
  render: ({ attrs }): ReactNode => {
    return <hr data-variant={pickVariant(attrs.variant)} />;
  },
});
