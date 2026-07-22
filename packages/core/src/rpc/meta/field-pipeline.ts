import { EMAIL_REGEX } from "valibot";

import type { Label } from "../../i18n/label.js";
import type {
  MetaBoxField,
  MetaBoxFieldOption,
  MetaScalarType,
  RepeaterMetaBoxField,
  RichtextMetaBoxField,
  TemporalInputType,
} from "../../plugin/manifest.js";
import { HEX_COLOR } from "../../plugin/fields/color.js";
import { parseLinkValue } from "../../plugin/fields/link.js";
import {
  SAFE_HREF_RE,
  walkRichtextDoc,
} from "../../plugin/fields/richtext-validate.js";
import {
  formatTemporalValue,
  isTemporalInputType,
  isValidTemporalValue,
} from "../../plugin/manifest.js";
import { META_FIELD_MESSAGES } from "./field-messages.js";

/**
 * A single write-rejection addressed to the exact field input — `path`
 * is dot-joined from the top-level meta key down into nested repeater
 * cells (`sections.2.heading`); `message` is i18n-able (descriptors
 * resolve through the admin catalog, plain strings pass through).
 */
export interface MetaFieldError {
  readonly path: string;
  readonly message: Label;
}

export interface FieldPipelineResult {
  readonly errors: readonly MetaFieldError[];
  /** Normalized value to persist; absent on deletion or error. */
  readonly value?: unknown;
  /** The input was `null`/`undefined` — a deletion request. */
  readonly isDeletion?: boolean;
}

/**
 * Run one value through the per-field write pipeline: coercion →
 * `.sanitize()` → declarative constraints → `.validate()`. Never
 * throws for value problems — they come back as `{ path, message }`
 * errors the RPC layer aggregates across the whole patch.
 */
export async function runFieldPipeline(
  field: MetaBoxField,
  raw: unknown,
  path: string,
): Promise<FieldPipelineResult> {
  if (raw === null || raw === undefined) {
    if (field.required) {
      return { errors: [{ path, message: META_FIELD_MESSAGES.required }] };
    }
    return { errors: [], isDeletion: true };
  }
  // `.returns("date")` hands the admin form a `Date`, and an untouched
  // field comes back as one on save — encode it to the field's stored
  // ISO shape (from UTC components) before the string coercion
  // rejects it.
  if (raw instanceof Date && isTemporalInputType(field.inputType)) {
    if (Number.isNaN(raw.getTime())) {
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
    raw = formatTemporalValue(field.inputType, raw);
  }
  const coerced = coerceValue(field.type, raw);
  if (!coerced.ok) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  if (isRepeaterField(field)) {
    return runRepeaterPipeline(field, coerced.value, path);
  }
  // Structural normalization is part of coercion: it runs before the
  // author's `.sanitize()` so the callback can trust its typed
  // parameter (a `LinkValue`, a `string[]` of option values, …).
  const normalized = normalizeValue(field, coerced.value, path);
  if (!normalized.ok) return { errors: [normalized.error] };
  let value = normalized.value;
  if (field.sanitize) {
    try {
      value = field.sanitize(value);
    } catch (error) {
      // Buggy callbacks round to a generic `invalid` for the editor;
      // keep the diagnostic trail in the server log.
      console.error(
        `[plumix] sanitize callback for meta field ${JSON.stringify(path)} threw:`,
        error,
      );
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
    // Re-normalize the callback's output — the shape gates (link URL
    // safety, hex format, option-array shape) are declared constraints,
    // and a transform must not be able to smuggle a value past them.
    const renormalized = normalizeValue(field, value, path);
    if (!renormalized.ok) return { errors: [renormalized.error] };
    value = renormalized.value;
  }
  if (field.required && isEmptyValue(value)) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.required }] };
  }
  const constraintErrors = checkConstraints(field, value, path);
  if (constraintErrors.length > 0) return { errors: constraintErrors };
  if (field.validate) {
    try {
      const verdict = await field.validate(value);
      if (verdict !== true) {
        return { errors: [{ path, message: verdict }] };
      }
    } catch (error) {
      console.error(
        `[plumix] validate callback for meta field ${JSON.stringify(path)} threw:`,
        error,
      );
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
  }
  return { errors: [], value };
}

// --- repeater rows ------------------------------------------------------

// Hard ceiling on row count regardless of field-level `max`. The 256 KiB
// meta byte cap doesn't bound work pre-walk: a payload of N empty rows
// allocates O(N) before the byte cap measures the post-strip output.
const MAX_REPEATER_ROWS = 1000;

export function isRepeaterField(
  field: MetaBoxField | undefined,
): field is RepeaterMetaBoxField {
  return field?.inputType === "repeater" && "subFields" in field;
}

// A row every cell of which reads empty is an authoring affordance, not
// data the caller meant to persist — stripped before validation, so a
// required subfield never blocks saving over a blank row. `0` and
// `false` are real values; only `null` / `undefined` / `""` are blank.
function isBlankRow(
  subFields: readonly MetaBoxField[],
  row: Record<string, unknown>,
): boolean {
  return subFields.every((sf) => {
    const cell = row[sf.key];
    return cell === null || cell === undefined || cell === "";
  });
}

/**
 * Recurse the pipeline into each kept row's cells. Error paths use the
 * caller's ORIGINAL row indices — the admin form still shows the blank
 * rows the strip removed, so a post-strip index would address the
 * wrong input. Row-count bounds apply to the kept rows.
 */
async function runRepeaterPipeline(
  field: RepeaterMetaBoxField,
  value: unknown,
  path: string,
): Promise<FieldPipelineResult> {
  if (!Array.isArray(value) || value.length > MAX_REPEATER_ROWS) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  const errors: MetaFieldError[] = [];
  const rows: Record<string, unknown>[] = [];
  for (const [idx, rawRow] of value.entries()) {
    if (
      rawRow === null ||
      typeof rawRow !== "object" ||
      Array.isArray(rawRow)
    ) {
      // Anchor on the repeater itself — the admin renders no message
      // slot at the bare row path, and only non-form callers can send
      // a non-object row anyway.
      errors.push({ path, message: META_FIELD_MESSAGES.invalid });
      continue;
    }
    const rowObj = rawRow as Record<string, unknown>;
    if (isBlankRow(field.subFields, rowObj)) continue;
    const next: Record<string, unknown> = {};
    for (const sf of field.subFields) {
      const cell = await runFieldPipeline(
        sf,
        rowObj[sf.key],
        `${path}.${String(idx)}.${sf.key}`,
      );
      errors.push(...cell.errors);
      if (cell.errors.length === 0 && cell.isDeletion !== true) {
        next[sf.key] = cell.value;
      }
    }
    rows.push(next);
  }
  if (field.required === true && rows.length === 0) {
    errors.push({ path, message: META_FIELD_MESSAGES.required });
  }
  if (field.min !== undefined && rows.length < field.min) {
    errors.push({
      path,
      message: { ...META_FIELD_MESSAGES.minRows, values: { min: field.min } },
    });
  }
  if (field.max !== undefined && rows.length > field.max) {
    errors.push({
      path,
      message: { ...META_FIELD_MESSAGES.maxRows, values: { max: field.max } },
    });
  }
  if (errors.length > 0) return { errors };
  return { errors: [], value: rows };
}

// Structural normalization that must succeed before the declarative
// constraints can inspect the value — a multi select's array shape and
// de-dupe live here so `checkConstraints` sees the canonical form.
type Normalized =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: MetaFieldError };

function normalizeValue(
  field: MetaBoxField,
  value: unknown,
  path: string,
): Normalized {
  if (field.inputType === "color") {
    if (typeof value !== "string" || !HEX_COLOR.test(value)) {
      return {
        ok: false,
        error: { path, message: META_FIELD_MESSAGES.invalid },
      };
    }
    return { ok: true, value: value.toLowerCase() };
  }
  if (field.inputType === "richtext") {
    const { marks, nodes, blocks } = field as RichtextMetaBoxField;
    try {
      return {
        ok: true,
        value: walkRichtextDoc({ marks, nodes, blocks })(value),
      };
    } catch (error) {
      // The walker's node-level path addresses ProseMirror positions,
      // not form inputs — the editor is one input, so the error lands
      // on the field; the detail stays in the server log.
      console.error(
        `[plumix] richtext doc for meta field ${JSON.stringify(path)} rejected:`,
        error,
      );
      return {
        ok: false,
        error: { path, message: META_FIELD_MESSAGES.invalid },
      };
    }
  }
  if (field.inputType === "link") {
    const parsed = parseLinkValue(value);
    if (parsed === null) {
      return {
        ok: false,
        error: { path, message: META_FIELD_MESSAGES.invalid },
      };
    }
    return { ok: true, value: parsed };
  }
  if (field.inputType === "select" && isMultiSelect(field)) {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        error: { path, message: META_FIELD_MESSAGES.invalid },
      };
    }
    const seen = new Set<string>();
    for (const item of value) {
      if (typeof item !== "string") {
        return {
          ok: false,
          error: { path, message: META_FIELD_MESSAGES.invalid },
        };
      }
      seen.add(item);
    }
    return { ok: true, value: [...seen] };
  }
  return { ok: true, value };
}

function isMultiSelect(
  field: MetaBoxField,
): field is Extract<MetaBoxField, { readonly multiple: true }> {
  return (field as { readonly multiple?: boolean }).multiple === true;
}

// --- declarative constraints -------------------------------------------
// One walker over the field-definition union: every constraint an
// author can declare is enforced here, keyed off the `inputType`
// discriminator. Replaces the per-factory hand-injected sanitizers.

function checkConstraints(
  field: MetaBoxField,
  value: unknown,
  path: string,
): MetaFieldError[] {
  if (isTemporalInputType(field.inputType)) {
    return checkTemporal(field.inputType, field, value, path);
  }
  if (field.inputType === "select") {
    const select = field as {
      readonly options?: readonly MetaBoxFieldOption[];
      readonly multiple?: boolean;
      readonly max?: number;
    };
    if (select.options) {
      return checkSelect(select.options, select, value, path);
    }
  }
  if (field.inputType === "email" && typeof value === "string") {
    if (value !== "" && !EMAIL_REGEX.test(value)) {
      return [{ path, message: META_FIELD_MESSAGES.invalidEmail }];
    }
  }
  if (field.inputType === "url" && typeof value === "string") {
    // Same gate as link fields and richtext link marks — the value is
    // destined for rendered hrefs, so script-bearing schemes hard-fail.
    if (value !== "" && !SAFE_HREF_RE.test(value)) {
      return [{ path, message: META_FIELD_MESSAGES.invalidUrl }];
    }
  }
  const errors: MetaFieldError[] = [];
  const maxLength = (field as { readonly maxLength?: number }).maxLength;
  if (
    maxLength !== undefined &&
    typeof value === "string" &&
    value.length > maxLength
  ) {
    errors.push({
      path,
      message: { ...META_FIELD_MESSAGES.maxLength, values: { max: maxLength } },
    });
  }
  if (typeof value === "number") {
    const { min, max } = field as {
      readonly min?: number;
      readonly max?: number;
    };
    if (typeof min === "number" && value < min) {
      errors.push({
        path,
        message: { ...META_FIELD_MESSAGES.min, values: { min } },
      });
    }
    if (typeof max === "number" && value > max) {
      errors.push({
        path,
        message: { ...META_FIELD_MESSAGES.max, values: { max } },
      });
    }
  }
  return errors;
}

function checkSelect(
  options: readonly MetaBoxFieldOption[],
  bounds: { readonly multiple?: boolean; readonly max?: number },
  value: unknown,
  path: string,
): MetaFieldError[] {
  const allowed = new Set(options.map((opt) => opt.value));
  if (bounds.multiple === true) {
    // `normalizeValue` guaranteed a de-duped string array (re-run on
    // the `.sanitize()` output, so the guarantee survives transforms).
    const items = value as readonly string[];
    if (items.some((item) => !allowed.has(item))) {
      return [{ path, message: META_FIELD_MESSAGES.invalidOption }];
    }
    if (bounds.max !== undefined && items.length > bounds.max) {
      return [
        {
          path,
          message: {
            ...META_FIELD_MESSAGES.maxItems,
            values: { max: bounds.max },
          },
        },
      ];
    }
    return [];
  }
  if (typeof value !== "string" || !allowed.has(value)) {
    return [{ path, message: META_FIELD_MESSAGES.invalidOption }];
  }
  return [];
}

function checkTemporal(
  inputType: TemporalInputType,
  field: MetaBoxField,
  value: unknown,
  path: string,
): MetaFieldError[] {
  if (typeof value !== "string" || !isValidTemporalValue(inputType, value)) {
    return [{ path, message: META_FIELD_MESSAGES.invalid }];
  }
  // ISO shapes compare lexicographically in temporal order, so the
  // bounds check is a plain string comparison against the authored
  // `min` / `max` (declared in the same stored shape).
  const { min, max } = field as {
    readonly min?: string;
    readonly max?: string;
  };
  const errors: MetaFieldError[] = [];
  if (min !== undefined && value < min) {
    errors.push({
      path,
      message: { ...META_FIELD_MESSAGES.minTemporal, values: { min } },
    });
  }
  if (max !== undefined && value > max) {
    errors.push({
      path,
      message: { ...META_FIELD_MESSAGES.maxTemporal, values: { max } },
    });
  }
  return errors;
}

// `.required()` rejects the values an editor produces by clearing an
// input: the empty string (text-family) and the empty array (multi
// selects, lists, repeaters). `0` and `false` are real values.
function isEmptyValue(value: unknown): boolean {
  if (value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

// --- type coercion ------------------------------------------------------
// Mirrors the storage `type` contract: the admin form sends native-input
// strings, direct RPC callers send whatever they like — both funnel into
// the declared scalar shape or fail as `invalid`.

type Coerced =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
    };

const COERCE_FAIL: Coerced = { ok: false };

function coerceValue(type: MetaScalarType, value: unknown): Coerced {
  switch (type) {
    case "string":
      return coerceString(value);
    case "number":
      return coerceNumber(value);
    case "boolean":
      return coerceBoolean(value);
    case "json":
      return coerceJson(value);
  }
}

function coerceString(value: unknown): Coerced {
  if (typeof value === "string") return { ok: true, value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value: String(value) };
  }
  if (typeof value === "boolean") return { ok: true, value: String(value) };
  return COERCE_FAIL;
}

function coerceNumber(value: unknown): Coerced {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value };
  }
  if (typeof value === "string") {
    // Empty string comes from cleared form inputs; the admin dispatcher
    // already sends `null` for those, but a direct RPC caller might send
    // "" — reject so we don't silently coerce to 0 (`Number("") === 0`).
    if (value.trim() === "") return COERCE_FAIL;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return { ok: true, value: parsed };
  }
  if (typeof value === "boolean") return { ok: true, value: value ? 1 : 0 };
  return COERCE_FAIL;
}

function coerceBoolean(value: unknown): Coerced {
  if (typeof value === "boolean") return { ok: true, value };
  if (value === 1 || value === "1" || value === "true") {
    return { ok: true, value: true };
  }
  if (value === 0 || value === "0" || value === "false") {
    return { ok: true, value: false };
  }
  return COERCE_FAIL;
}

function coerceJson(value: unknown): Coerced {
  // json keys take anything round-trippable through JSON.stringify —
  // reject values that throw (BigInt) or silently drop (functions,
  // Symbols) so reads don't hand back `undefined` for something a
  // plugin thought it stored.
  try {
    const encoded = JSON.stringify(value) as string | undefined;
    if (encoded === undefined) return COERCE_FAIL;
    return { ok: true, value: JSON.parse(encoded) };
  } catch {
    return COERCE_FAIL;
  }
}
