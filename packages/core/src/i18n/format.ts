import { formats } from "@lingui/core";

// Lingui already ships `formats.date()` and `formats.number()` with the
// (locale, value, options) shape we want — re-export under narrowed
// signatures (string locale, no Lingui-internal types in our public
// surface) and implement only `formatRelative` (Lingui doesn't ship a
// relative-time formatter). All three are pure functions; the React
// `useFormatters()` hook lives next to the consumer (admin) where
// Lingui's React context is available.

export const formatDate: (
  locale: string,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
) => string = formats.date;

export const formatNumber: (
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions,
) => string = formats.number;

export interface FormatRelativeOptions extends Intl.RelativeTimeFormatOptions {
  /** Reference point for the diff. Defaults to `new Date()`; pass an
   *  explicit `now` for deterministic tests. */
  readonly now?: Date;
}

const UNITS: readonly {
  readonly unit: Intl.RelativeTimeFormatUnit;
  readonly ms: number;
}[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60_000 },
  { unit: "month", ms: 30 * 24 * 60 * 60_000 },
  { unit: "week", ms: 7 * 24 * 60 * 60_000 },
  { unit: "day", ms: 24 * 60 * 60_000 },
  { unit: "hour", ms: 60 * 60_000 },
  { unit: "minute", ms: 60_000 },
  { unit: "second", ms: 1_000 },
];

/** Locale-aware relative-time formatting with auto-unit selection
 *  ("3 days ago", "in 2 hours"). Picks the largest unit whose
 *  threshold the diff exceeds, then defers to `Intl.RelativeTimeFormat`
 *  for the locale-specific rendering. */
export function formatRelative(
  locale: string,
  value: Date,
  options?: FormatRelativeOptions,
): string {
  const { now, ...intlOptions } = options ?? {};
  const reference = (now ?? new Date()).getTime();
  const diffMs = value.getTime() - reference;
  const absMs = Math.abs(diffMs);
  const sign = diffMs < 0 ? -1 : 1;
  const choice = UNITS.find((u) => absMs >= u.ms) ?? {
    unit: "second" as const,
    ms: 1_000,
  };
  const magnitude = Math.round(absMs / choice.ms) * sign;
  return new Intl.RelativeTimeFormat(locale, intlOptions).format(
    magnitude,
    choice.unit,
  );
}
