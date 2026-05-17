import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const ALIGNS = ["start", "center", "end", "between"] as const;

function pickAlign(raw: unknown): (typeof ALIGNS)[number] | undefined {
  return typeof raw === "string" && (ALIGNS as readonly string[]).includes(raw)
    ? (raw as (typeof ALIGNS)[number])
    : undefined;
}

function normalizeGap(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return `${raw}px`;
  if (typeof raw === "string" && raw.length > 0) return raw;
  return undefined;
}

export function ButtonsComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const align = pickAlign(attrs.align);
  const gap = normalizeGap(attrs.gap);
  return (
    <div data-plumix-block="core/buttons" data-align={align} data-gap={gap}>
      {children}
    </div>
  );
}
