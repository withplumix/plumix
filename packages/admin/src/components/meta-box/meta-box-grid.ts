import { cn } from "@/lib/utils";

import type { MetaBoxFieldSpan } from "@plumix/core/manifest";

type SpanValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// Literal col-span class strings for every valid span value. Tailwind v4's
// JIT only generates classes it can see verbatim in source — building them
// with template strings (`col-span-${n}`) would silently purge at build.
// Keep these tables exhaustive for 1..12 at every breakpoint we expose.
const BASE: Record<SpanValue, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
  7: "col-span-7",
  8: "col-span-8",
  9: "col-span-9",
  10: "col-span-10",
  11: "col-span-11",
  12: "col-span-12",
};

const SM: Record<SpanValue, string> = {
  1: "@sm:col-span-1",
  2: "@sm:col-span-2",
  3: "@sm:col-span-3",
  4: "@sm:col-span-4",
  5: "@sm:col-span-5",
  6: "@sm:col-span-6",
  7: "@sm:col-span-7",
  8: "@sm:col-span-8",
  9: "@sm:col-span-9",
  10: "@sm:col-span-10",
  11: "@sm:col-span-11",
  12: "@sm:col-span-12",
};

const MD: Record<SpanValue, string> = {
  1: "@md:col-span-1",
  2: "@md:col-span-2",
  3: "@md:col-span-3",
  4: "@md:col-span-4",
  5: "@md:col-span-5",
  6: "@md:col-span-6",
  7: "@md:col-span-7",
  8: "@md:col-span-8",
  9: "@md:col-span-9",
  10: "@md:col-span-10",
  11: "@md:col-span-11",
  12: "@md:col-span-12",
};

const LG: Record<SpanValue, string> = {
  1: "@lg:col-span-1",
  2: "@lg:col-span-2",
  3: "@lg:col-span-3",
  4: "@lg:col-span-4",
  5: "@lg:col-span-5",
  6: "@lg:col-span-6",
  7: "@lg:col-span-7",
  8: "@lg:col-span-8",
  9: "@lg:col-span-9",
  10: "@lg:col-span-10",
  11: "@lg:col-span-11",
  12: "@lg:col-span-12",
};

const DEFAULT_BASE: SpanValue = 12;

function clamp(n: number): SpanValue {
  if (!Number.isFinite(n)) return DEFAULT_BASE;
  const rounded = Math.round(n);
  if (rounded < 1) return 1;
  if (rounded > 12) return 12;
  return rounded as SpanValue;
}

/**
 * Resolve a (possibly responsive) field span into Tailwind col-span
 * classes. Mobile-first: `base` applies from 0+, each larger breakpoint
 * overrides upward at the card's container width (`@sm` / `@md` / `@lg`).
 * Out-of-range values are clamped to 1..12; omitted span is full width.
 */
export function metaBoxFieldColSpanClass(
  span: MetaBoxFieldSpan | undefined,
): string {
  if (typeof span === "number") return BASE[clamp(span)];
  return cn(
    BASE[clamp(span?.base ?? DEFAULT_BASE)],
    span?.sm !== undefined && SM[clamp(span.sm)],
    span?.md !== undefined && MD[clamp(span.md)],
    span?.lg !== undefined && LG[clamp(span.lg)],
  );
}
