import { EMAIL_REGEX } from "valibot";

import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type {
  GroupMetaBoxField,
  MetaBoxField,
  MetaBoxFieldOption,
  MetaScalarType,
  ReferenceTarget,
  RepeaterMetaBoxField,
  RichtextMetaBoxField,
  TemporalInputType,
} from "../../plugin/manifest.js";
import type { ResolvedMeta } from "./core.js";
import { isJsonArray } from "../../json.js";
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
  readonly value?: JsonValue;
  /** The input was `null`/`undefined` — a deletion request. */
  readonly isDeletion?: boolean;
}

/**
 * Validation strictness. `strict` (the default) enforces every declared
 * constraint. `draft` skips the business-rule layer — required, numeric /
 * temporal bounds, `maxLength`, option membership, format checks, repeater /
 * group row counts, and `.validate()` — so an autosave of work-in-progress
 * never fails; the structural + security gates (coercion, shape
 * normalization, `.sanitize()`, temporal validity, url safe-href) still run,
 * so a draft can never persist corrupt or unsafe data. Publish re-runs the
 * bag in `strict` mode.
 */
export type FieldPipelineMode = "draft" | "strict";

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
  mode: FieldPipelineMode = "strict",
): Promise<FieldPipelineResult> {
  if (raw === null || raw === undefined) {
    if (field.required && mode === "strict") {
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
  // Same round-trip reality for references: reads hydrate to
  // `{ id, ... }` payloads and untouched fields come back as them —
  // heal to the stored plain-id shape before coercion rejects the
  // object. Repeater cells recurse through here, so nested refs heal
  // too.
  const target = referenceTargetOf(field);
  // The bag arrived as JSON off the wire; the pipeline has not proved that
  // yet, because retyping `MetaInput` is the deferred half of #1807.
  if (target) raw = healReferenceValue(target, raw as JsonValue);
  const coerced = coerceValue(field.type, raw);
  if (!coerced.ok) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  if (isRepeaterField(field)) {
    return runRepeaterPipeline(field, coerced.value, path, mode);
  }
  if (isGroupField(field)) {
    return runGroupPipeline(field, coerced.value, path, mode);
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
  if (field.required && mode === "strict" && isEmptyValue(value)) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.required }] };
  }
  const constraintErrors = checkConstraints(field, value, path, mode);
  if (constraintErrors.length > 0) return { errors: constraintErrors };
  if (field.validate && mode === "strict") {
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
  // Everything the pipeline itself produces is JSON: `coerceJson` round-trips
  // through `JSON.stringify`/`parse` and every other branch builds primitives
  // from a coerced value. The hole the assertion papers over is `.sanitize()` —
  // the descriptor erases its signature, and its output is re-normalized but
  // never re-coerced, so a callback returning a `Date` reaches this line and is
  // written as whatever `JSON.stringify` makes of it. Closing that means
  // re-coercing after the callback, which changes behaviour; #1807 defers the
  // meta pipeline's parse migration to its own spec.
  return { errors: [], value: value as JsonValue };
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

export function isGroupField(
  field: MetaBoxField | undefined,
): field is GroupMetaBoxField {
  return field?.inputType === "group" && "fields" in field;
}

// --- group members ------------------------------------------------------

/**
 * Recurse the pipeline into each member of a group, addressing errors
 * by `${path}.${memberKey}` (nested repeaters/groups extend the path
 * further). A group all of whose members read empty is dropped (a
 * deletion) unless the group is `.required()`. Members are stored back
 * as a nested object keyed by member field key — no key-flattening.
 */
async function runGroupPipeline(
  field: GroupMetaBoxField,
  value: unknown,
  path: string,
  mode: FieldPipelineMode,
): Promise<FieldPipelineResult> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  const source = value as Record<string, unknown>;
  // Mirrors the repeater's blank-row strip, and must run BEFORE member
  // validation: an all-empty group is an authoring affordance, not data,
  // so it's dropped (optional) or rejected at the group path (required)
  // without ever validating members. Otherwise a `.required()` member on
  // an untouched optional group would error and make the group
  // impossible to clear. "Empty" is strictly `null` / `undefined` / `""`
  // per `isBlankRow`; `0` / `false` are real values.
  if (isBlankRow(field.fields, source)) {
    if (field.required === true && mode === "strict") {
      return { errors: [{ path, message: META_FIELD_MESSAGES.required }] };
    }
    return { errors: [], isDeletion: true };
  }
  // A populated group keeps every member (blank cells included) and
  // validates each — a required member left empty in a non-empty group
  // is a real error, just as in a non-blank repeater row.
  const errors: MetaFieldError[] = [];
  const next: Record<string, JsonValue> = {};
  for (const member of field.fields) {
    const cell = await runFieldPipeline(
      member,
      source[member.key],
      `${path}.${member.key}`,
      mode,
    );
    errors.push(...cell.errors);
    if (cell.errors.length === 0 && cell.value !== undefined) {
      next[member.key] = cell.value;
    }
  }
  if (errors.length > 0) return { errors };
  return { errors: [], value: next };
}

// --- reference healing --------------------------------------------------

export function referenceTargetOf(
  field: MetaBoxField | undefined,
): ReferenceTarget | undefined {
  if (!field) return undefined;
  return (field as { readonly referenceTarget?: ReferenceTarget })
    .referenceTarget;
}

/**
 * Returns the `id` string of a `{ id: string, ... }` object, or null
 * for any other shape (string, array, null, primitive, missing key).
 */
export function extractStringId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const id = (value as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/**
 * Collapse a reference slot to the stored plain-id shape: hydrated
 * payloads (and legacy write-time snapshots) read/write as their `id`;
 * already-plain values pass through identity-preserving.
 */
export function healReferenceValue(
  target: ReferenceTarget,
  value: JsonValue,
): JsonValue {
  if (target.multiple) {
    if (!isJsonArray(value)) return value;
    // Identity-preserving on the already-plain path — `healRepeaterRow`
    // clones a row only when the healed slot differs.
    if (!value.some((item) => extractStringId(item) !== null)) {
      return value;
    }
    return value.map((item) => extractStringId(item) ?? item);
  }
  return extractStringId(value) ?? value;
}

// A row every cell of which reads empty is an authoring affordance, not
// data the caller meant to persist — stripped before validation, so a
// required subfield never blocks saving over a blank row. `0` and
// `false` are real values; only `null` / `undefined` / `""` are blank.
function isBlankRow(
  subFields: readonly MetaBoxField[],
  row: ResolvedMeta,
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
  mode: FieldPipelineMode,
): Promise<FieldPipelineResult> {
  if (!Array.isArray(value) || value.length > MAX_REPEATER_ROWS) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  const errors: MetaFieldError[] = [];
  const rows: Record<string, JsonValue>[] = [];
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
    const next: Record<string, JsonValue> = {};
    for (const sf of field.subFields) {
      const cell = await runFieldPipeline(
        sf,
        rowObj[sf.key],
        `${path}.${String(idx)}.${sf.key}`,
        mode,
      );
      errors.push(...cell.errors);
      if (cell.errors.length === 0 && cell.value !== undefined) {
        next[sf.key] = cell.value;
      }
    }
    rows.push(next);
  }
  // Row counts are business rules — a draft may be mid-authoring with too
  // few (or a transient too many) rows. Cell-level structural errors above
  // still surface in draft mode.
  if (mode === "strict") {
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
  mode: FieldPipelineMode,
): MetaFieldError[] {
  if (isTemporalInputType(field.inputType)) {
    return checkTemporal(field.inputType, field, value, path, mode);
  }
  if (field.inputType === "url" && typeof value === "string") {
    // Security gate, not a business rule — the value is destined for a
    // rendered href, so script-bearing schemes hard-fail even in draft mode.
    if (value !== "" && !SAFE_HREF_RE.test(value)) {
      return [{ path, message: META_FIELD_MESSAGES.invalidUrl }];
    }
  }
  // Everything below is a business-rule constraint: option membership,
  // format, and length/count bounds. A draft may hold not-yet-valid content,
  // so skip them — publish re-runs the bag in strict mode.
  if (mode === "draft") return [];
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
  mode: FieldPipelineMode,
): MetaFieldError[] {
  // Shape/validity is structural — a garbage date is always rejected.
  if (typeof value !== "string" || !isValidTemporalValue(inputType, value)) {
    return [{ path, message: META_FIELD_MESSAGES.invalid }];
  }
  // Bounds are a business rule — a draft may sit outside them.
  if (mode === "draft") return [];
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
