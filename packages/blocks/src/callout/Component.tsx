import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const VARIANTS = ["info", "warn", "error", "success", "note"] as const;
type CalloutVariant = (typeof VARIANTS)[number];

function pickVariant(raw: unknown): CalloutVariant {
  return typeof raw === "string" &&
    (VARIANTS as readonly string[]).includes(raw)
    ? (raw as CalloutVariant)
    : "info";
}

export function CalloutComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const variant = pickVariant(attrs.variant);
  const icon = typeof attrs.icon === "string" ? attrs.icon : undefined;
  return (
    <aside
      role="note"
      data-plumix-block="core/callout"
      data-variant={variant}
      data-icon={icon}
    >
      {children}
    </aside>
  );
}
