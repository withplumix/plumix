import type { JsonObject } from "@plumix/core";
import type { Label } from "@plumix/core/i18n";
import type {
  MetaBoxFieldManifestEntry,
  TemporalInputType,
} from "@plumix/core/manifest";
import { formatTemporalValue } from "@plumix/core/manifest";

import type { LookupItem } from "./lookup/types.js";

/**
 * Meta values arrive as `unknown` because the registry isn't per-type-generic.
 */
export function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * What a number input's raw text stores: `null` when cleared, `undefined` for
 * partial input like "-" or "1e" (which parses to NaN), so nothing is emitted.
 */
export function numberInputValue(raw: string): number | null | undefined {
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The ISO-shaped strings native inputs emit are stored as-is. */
export function temporalInputValue(raw: string): string | null {
  return raw === "" ? null : raw;
}

/**
 * A `.returns("date")` value's wall-clock anchors to UTC; the server's own
 * formatter keeps the display timezone-invariant.
 */
export function temporalDisplayValue(
  inputType: TemporalInputType,
  value: unknown,
): string {
  if (!(value instanceof Date)) return asString(value);
  return Number.isNaN(value.getTime())
    ? ""
    : formatTemporalValue(inputType, value);
}

/**
 * The native `type` attribute drives both browser validation (email / url)
 * and visual masking (password).
 */
const NATIVE_HTML_INPUT_TYPES: ReadonlySet<string> = new Set([
  "email",
  "url",
  "password",
  "date",
  "time",
]);

export function htmlInputType(inputType: string): string {
  if (inputType === "datetime") return "datetime-local";
  return NATIVE_HTML_INPUT_TYPES.has(inputType) ? inputType : "text";
}

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "email",
  "url",
  "password",
]);

/**
 * Whether the text input renders this type as itself; any other type reaching
 * it is a plugin-specific one falling back to text.
 */
export function isBuiltinInputType(inputType: string): boolean {
  return TEXT_INPUT_TYPES.has(inputType);
}

/**
 * Radix reserves "" for "no selection", but a plugin may legitimately register
 * an option whose value is "".
 */
const EMPTY_OPTION_VALUE = "__plumix_empty__";

export function encodeOptionValue(value: string): string {
  return value === "" ? EMPTY_OPTION_VALUE : value;
}

export function decodeOptionValue(value: string): string {
  return value === EMPTY_OPTION_VALUE ? "" : value;
}

/**
 * Emitted in declared-option order, not click order, so the stored array is
 * the same across the multi appearances.
 */
export function orderedSelection(
  options: readonly { readonly value: string }[],
  picked: Iterable<string>,
): string[] {
  const set = new Set(picked);
  return options.filter((o) => set.has(o.value)).map((o) => o.value);
}

export function toggleStateText(
  field: MetaBoxFieldManifestEntry,
  value: unknown,
): Label | undefined {
  return value === true ? field.onText : field.offText;
}

/**
 * Keyed by `inputType`, not the keys' presence, so stray adornments on other
 * types render nothing. `link` places its own.
 */
const ADORNED_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "email",
  "url",
  "password",
  "number",
  "textarea",
]);

export function isAdorned(field: MetaBoxFieldManifestEntry): boolean {
  return (
    ADORNED_INPUT_TYPES.has(field.inputType) &&
    (field.prepend !== undefined || field.append !== undefined)
  );
}

/**
 * Reads arrive hydrated as `{ id, ... }`; drafts and `.returns("id")` opt-outs
 * carry the bare id.
 */
export function referenceValueId(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const id = (value as { readonly id?: unknown }).id;
    if (typeof id === "string" && id !== "") return id;
  }
  return null;
}

/**
 * Null on a missing label so the picker's lookup can offer its richer fallback
 * (untitled chrome, email). No subtitle: the public-safe summary lacks it.
 */
export function referenceValueSummary(value: unknown): LookupItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const summary = value as JsonObject;
  if (typeof summary.id !== "string" || summary.id === "") return null;
  const label =
    typeof summary.title === "string"
      ? summary.title
      : typeof summary.name === "string"
        ? summary.name
        : null;
  if (label === null) return null;
  return { id: summary.id, label };
}

/**
 * A plugin field's error boundary resets when this changes. Cycles and BigInts
 * fall back to a constant, so the boundary won't reset on them.
 */
export function resetKeyFor(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "__unserializable__";
  }
}

/**
 * The bag a plugin field reads its siblings from. A box at the form root (the
 * settings card) reads the whole form, so it has none.
 */
export function siblingBagName(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? undefined : name.slice(0, dot);
}
