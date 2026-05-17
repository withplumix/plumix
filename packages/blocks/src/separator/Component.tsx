import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const VARIANTS = ["solid", "dashed", "dotted", "wide"] as const;
type SeparatorVariant = (typeof VARIANTS)[number];

function pickVariant(raw: unknown): SeparatorVariant {
  return typeof raw === "string" &&
    (VARIANTS as readonly string[]).includes(raw)
    ? (raw as SeparatorVariant)
    : "solid";
}

export function SeparatorComponent({ attrs }: BlockProps): ReactElement {
  return (
    <hr
      data-plumix-block="core/separator"
      data-variant={pickVariant(attrs.variant)}
    />
  );
}
