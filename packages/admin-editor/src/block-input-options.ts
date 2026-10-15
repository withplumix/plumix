import type { BlockInputOption } from "@plumix/core/blocks";

/**
 * Block attr values are primitives in practice; coerce only the primitive
 * kinds so a stray object can't stringify to "[object Object]".
 */
export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * DOM control values are strings; key options by their stringified value so
 * number/boolean options round-trip back to their typed form via decodeOption.
 */
export function optionKey(value: unknown): string {
  return asString(value);
}

/**
 * Radix Select throws on an empty-string item value, but an option's key can
 * legitimately be "".
 */
const SELECT_EMPTY = "__plumix_empty__";

export function encodeSelectKey(value: unknown): string {
  // Unset maps to Radix's reserved "" so the trigger renders its placeholder.
  if (value === undefined || value === null) return "";
  const key = optionKey(value);
  return key === "" ? SELECT_EMPTY : key;
}

export function decodeSelectKey(key: string): string {
  return key === SELECT_EMPTY ? "" : key;
}

/** The typed option value a key stands for, or the key itself when no option
 *  matches. */
export function decodeOption(
  options: readonly BlockInputOption[],
  key: string,
): BlockInputOption["value"] {
  const match = options.find((opt) => optionKey(opt.value) === key);
  return match ? match.value : key;
}

/**
 * Empty or unparseable (a lone "-"/"e" mid-typing) clears to null rather than
 * poisoning the tree with NaN.
 */
export function parseNumberInput(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isNaN(value) ? null : value;
}

/** A combobox row: cmdk filters on `value`, and `keywords` let a search match
 *  the display text too (e.g. "C++" for the `cpp` value). */
export interface ComboboxItem {
  readonly option: BlockInputOption;
  readonly value: string;
  readonly label: string;
  readonly keywords: readonly string[];
}

export function comboboxItems(
  options: readonly BlockInputOption[],
  labelOf: (option: BlockInputOption) => string,
): readonly ComboboxItem[] {
  return options.map((option) => {
    const label = labelOf(option);
    return { option, value: optionKey(option.value), label, keywords: [label] };
  });
}

/** The free-typed value a combobox offers to create, or `null` when the query
 *  is blank or already an option's value. */
export function comboboxCreatable(
  query: string,
  options: readonly BlockInputOption[],
): string | null {
  const custom = query.trim();
  if (custom === "") return null;
  return options.some((opt) => optionKey(opt.value) === custom) ? null : custom;
}
