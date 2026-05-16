import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

// Matches `n[:m]*` where each part is a positive integer. Catches both
// the canonical "1:1", "1:2", "1:1:1" and pathological values like
// `lol`, `1:`, `:2`, `1::2`. Cap the part count at 6 because columns
// beyond that produce unreadable layouts at typical breakpoints anyway.
const RATIO_PATTERN = /^[1-9]\d*(?::[1-9]\d*){0,5}$/;

function isRatio(value: unknown): value is string {
  return typeof value === "string" && RATIO_PATTERN.test(value);
}

export function ColumnsComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const ratio = isRatio(attrs.ratio) ? attrs.ratio : undefined;
  return (
    <div data-plumix-block="core/columns" data-ratio={ratio}>
      {children}
    </div>
  );
}

function normalizeWidth(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return `${raw}%`;
  return undefined;
}

export function ColumnComponent({ attrs, children }: BlockProps): ReactElement {
  const width = normalizeWidth(attrs.width);
  return (
    <div data-plumix-block="core/column" data-width={width}>
      {children}
    </div>
  );
}
