import { EMAIL_REGEX } from "valibot";

import type { Label } from "../i18n/label.js";
import type { JsonValue } from "../json.js";
import type {
  GroupMetaBoxField,
  MetaBoxField,
  MetaBoxFieldOption,
  ReferenceTarget,
  RepeaterMetaBoxField,
  RichtextMetaBoxField,
  TemporalInputType,
} from "../plugin/manifest.js";
import type { ResolvedMeta } from "./contract/bags.js";
import { isJsonArray, isJsonObject } from "../json.js";
import { HEX_COLOR } from "../plugin/fields/color.js";
import { isFieldVisible } from "../plugin/fields/condition.js";
import { parseLinkValue } from "../plugin/fields/link.js";
import {
  SAFE_HREF_RE,
  walkRichtextDoc,
} from "../plugin/fields/richtext-validate.js";
import {
  formatTemporalValue,
  isTemporalInputType,
  isValidTemporalValue,
} from "../plugin/manifest.js";
import { coerceValue, decodeJsonValue, extractStringId } from "./coerce.js";
import { META_FIELD_MESSAGES } from "./contract/field-messages.js";

/**
 * `path` is dot-joined from the top-level key into nested cells
 * (`sections.2.heading`); `message` may be a catalog descriptor.
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
 * `draft` skips the business rules (required, bounds, formats, row counts,
 * `.validate()`) so autosaves never fail, but still runs coercion,
 * `.sanitize()` and the safety gates.
 */
export type FieldPipelineMode = "draft" | "strict";

/**
 * Never throws for value problems: they come back as `{ path, message }`
 * errors.
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
  // An untouched `.returns("date")` field comes back as a `Date`; encode it to
  // the stored ISO shape before string coercion rejects it.
  if (raw instanceof Date && isTemporalInputType(field.inputType)) {
    if (Number.isNaN(raw.getTime())) {
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
    raw = formatTemporalValue(field.inputType, raw);
  }
  // Untouched references come back as hydrated `{ id, ... }` payloads; heal
  // them to plain ids before coercion rejects the object.
  const target = referenceTargetOf(field);
  if (target) {
    // Decode before healing: the bag arrives unproven, and every scalar
    // coercion rejects the values that have no JSON at all anyway.
    const decoded = decodeJsonValue(raw);
    if (decoded === undefined) {
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
    raw = healReferenceValue(target, decoded);
  }
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
    let transformed: unknown;
    try {
      transformed = field.sanitize(value);
    } catch (error) {
      // Buggy callbacks round to a generic `invalid` for the editor;
      // keep the diagnostic trail in the server log.
      console.error(
        `[plumix] sanitize callback for meta field ${JSON.stringify(path)} threw:`,
        error,
      );
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
    // A callback that returns nothing leaves nothing to persist; the key is
    // left alone rather than written as `undefined` (see `sanitizeMetaInput`).
    if (transformed === undefined) return { errors: [] };
    // The descriptor types the return as `JsonValue`, but nothing enforces it
    // at runtime, so the output clears the same gates its input did.
    const recoerced = coerceValue(field.type, transformed);
    if (!recoerced.ok) {
      return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
    }
    const renormalized = normalizeValue(field, recoerced.value, path);
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
  return { errors: [], value };
}

// --- repeater rows ------------------------------------------------------

// The 256 KiB byte cap doesn't bound work pre-walk: N empty rows allocate O(N)
// before it measures the stripped output.
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

// A group whose members all read empty is dropped unless `.required()`.
async function runGroupPipeline(
  field: GroupMetaBoxField,
  value: JsonValue,
  path: string,
  mode: FieldPipelineMode,
): Promise<FieldPipelineResult> {
  if (!isJsonObject(value)) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  const blank = checkGroupBlank(field, value, path, mode);
  if (blank) return blank;
  const settled = await settleGroupMembers(field, value, path, mode);
  if (settled.result) return settled.result;
  let members = settled.members;

  if (field.sanitize) {
    const sanitized = applyCompositeSanitize(
      field,
      field.sanitize,
      members,
      path,
    );
    if (sanitized.result) return sanitized.result;
    // Blank check in the caller's mode: a sanitizer clearing a required group
    // rejects like a manual clear. Members re-walk in draft so safety gates
    // bind.
    const clearedBlank = checkGroupBlank(field, sanitized.value, path, mode);
    if (clearedBlank) return clearedBlank;
    const resettled = await settleGroupMembers(
      field,
      sanitized.value,
      path,
      "draft",
    );
    if (resettled.result) return resettled.result;
    members = resettled.members;
  }

  return runCompositeValidate(field, members, path, mode);
}

// Runs before member validation, or a required member of an untouched optional
// group would make the group impossible to clear. `0` and `false` are values.
function checkGroupBlank(
  field: GroupMetaBoxField,
  value: Readonly<Record<string, JsonValue>>,
  path: string,
  mode: FieldPipelineMode,
): FieldPipelineResult | undefined {
  if (!isBlankRow(field.fields, value)) return undefined;
  if (field.required === true && mode === "strict") {
    return { errors: [{ path, message: META_FIELD_MESSAGES.required }] };
  }
  return { errors: [], isDeletion: true };
}

async function settleGroupMembers(
  field: GroupMetaBoxField,
  value: Readonly<Record<string, JsonValue>>,
  path: string,
  mode: FieldPipelineMode,
): Promise<{
  readonly result?: FieldPipelineResult;
  readonly members: Record<string, JsonValue>;
}> {
  // A required member left empty in a non-empty group is a real error.
  const errors: MetaFieldError[] = [];
  const members: Record<string, JsonValue> = {};
  for (const member of field.fields) {
    const cell = await runFieldPipeline(
      member,
      value[member.key],
      `${path}.${member.key}`,
      cellMode(member, value, mode),
    );
    errors.push(...cell.errors);
    if (cell.errors.length === 0 && cell.value !== undefined) {
      members[member.key] = cell.value;
    }
  }
  if (errors.length > 0) return { result: { errors }, members };
  return { members };
}

// --- composite hooks ----------------------------------------------------

// Runs after every sub-field settled, so the callback sees what would be
// stored rather than raw `Date`s or reference payloads. Re-settling cells is
// the caller's job.
function applyCompositeSanitize<T extends JsonValue>(
  field: RepeaterMetaBoxField | GroupMetaBoxField,
  sanitize: (value: unknown) => JsonValue,
  assembled: T,
  path: string,
): { readonly result?: FieldPipelineResult; readonly value: T } {
  let transformed: unknown;
  try {
    transformed = sanitize(assembled);
  } catch (error) {
    return {
      result: callbackFailed("sanitize", path, error),
      value: assembled,
    };
  }
  // Mirrors the scalar path — see `runFieldPipeline`.
  if (transformed === undefined) {
    return { result: { errors: [] }, value: assembled };
  }
  const decoded = decodeJsonValue(transformed);
  if (decoded === undefined || !isCompositeShape(field, decoded)) {
    return {
      result: { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] },
      value: assembled,
    };
  }
  // Safety: `isCompositeShape` just proved `decoded` is the composite's own
  // shape, which is what `T` is at both call sites.
  return { value: decoded as T };
}

// Runs last, so cross-row rules see exactly what will be stored. Condition-
// hidden cells were only draft-checked, so the value may hold cells that never
// met their strict constraints.
async function runCompositeValidate(
  field: RepeaterMetaBoxField | GroupMetaBoxField,
  value: JsonValue,
  path: string,
  mode: FieldPipelineMode,
): Promise<FieldPipelineResult> {
  if (!field.validate || mode !== "strict") return { errors: [], value };
  try {
    const verdict = await field.validate(value);
    if (verdict !== true) return { errors: [{ path, message: verdict }] };
  } catch (error) {
    return callbackFailed("validate", path, error);
  }
  return { errors: [], value };
}

// The editor has no vocabulary for "the plugin threw"; the diagnostic trail
// stays in the server log.
function callbackFailed(
  kind: "sanitize" | "validate",
  path: string,
  error: unknown,
): FieldPipelineResult {
  console.error(
    `[plumix] ${kind} callback for meta field ${JSON.stringify(path)} threw:`,
    error,
  );
  return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
}

// The row ceiling is re-applied because a sanitizer can grow the list after
// the pre-walk bound was measured.
function isCompositeShape(
  field: RepeaterMetaBoxField | GroupMetaBoxField,
  value: JsonValue,
): boolean {
  if (isGroupField(field)) {
    return (
      isJsonObject(value) &&
      hasOnlyDeclaredKeys(declaredKeys(field.fields), value)
    );
  }
  const keys = declaredKeys(field.subFields);
  return (
    isJsonArray(value) &&
    value.length <= MAX_REPEATER_ROWS &&
    value.every((row) => isJsonObject(row) && hasOnlyDeclaredKeys(keys, row))
  );
}

function declaredKeys(fields: readonly MetaBoxField[]): ReadonlySet<string> {
  return new Set(fields.map((field) => field.key));
}

function hasOnlyDeclaredKeys(
  keys: ReadonlySet<string>,
  value: Readonly<Record<string, JsonValue>>,
): boolean {
  return Object.keys(value).every((key) => keys.has(key));
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

// Hidden cells run in draft and are kept, not dropped: a row is rewritten whole
// on every save. `isFieldVisible` because a row is complete, so an absent
// driver means unset.
function cellMode(
  field: MetaBoxField,
  bag: ResolvedMeta,
  mode: FieldPipelineMode,
): FieldPipelineMode {
  return isFieldVisible(field, bag) ? mode : "draft";
}

// Blank rows are an authoring affordance, stripped before validation so a
// required subfield never blocks the save. `0` and `false` are values.
function isBlankRow(
  subFields: readonly MetaBoxField[],
  row: ResolvedMeta,
): boolean {
  return subFields.every((sf) => {
    const cell = row[sf.key];
    return cell === null || cell === undefined || cell === "";
  });
}

// Error paths use the original row indices: the admin form still shows the
// blank rows the strip removed.
async function runRepeaterPipeline(
  field: RepeaterMetaBoxField,
  value: JsonValue,
  path: string,
  mode: FieldPipelineMode,
): Promise<FieldPipelineResult> {
  if (!isJsonArray(value) || value.length > MAX_REPEATER_ROWS) {
    return { errors: [{ path, message: META_FIELD_MESSAGES.invalid }] };
  }
  const settled = await settleRepeaterRows(field, value, path, mode);
  if (settled.result) return settled.result;
  let rows = settled.rows;
  // Only the empty case settles before the hooks. A sanitizer trimming to
  // `.max()` or padding to `.min()` is what the hook is for.
  if (rows.length === 0) {
    const emptied = checkRowCount(field, rows, path, mode);
    if (emptied) return emptied;
  }

  if (field.sanitize) {
    const sanitized = applyCompositeSanitize(field, field.sanitize, rows, path);
    if (sanitized.result) return sanitized.result;
    // Cells re-settle so the security gates bind whatever is stored. Row counts
    // re-check in the caller's mode, so `.min()` still binds a de-duped list.
    const resettled = await settleRepeaterRows(
      field,
      sanitized.value,
      path,
      "draft",
      false,
    );
    if (resettled.result) return resettled.result;
    rows = resettled.rows;
  }

  const bounded = checkRowCount(field, rows, path, mode);
  if (bounded) return bounded;

  return runCompositeValidate(field, rows, path, mode);
}

// After a `.sanitize()` row positions no longer name what the caller sent, so
// cell errors anchor on the repeater rather than highlight the wrong row.
async function settleRepeaterRows(
  field: RepeaterMetaBoxField,
  value: readonly JsonValue[],
  path: string,
  mode: FieldPipelineMode,
  addressable = true,
): Promise<{
  readonly result?: FieldPipelineResult;
  readonly rows: Record<string, JsonValue>[];
}> {
  const errors: MetaFieldError[] = [];
  const rows: Record<string, JsonValue>[] = [];
  for (const [idx, rawRow] of value.entries()) {
    if (!isJsonObject(rawRow)) {
      // Anchor on the repeater itself — the admin renders no message
      // slot at the bare row path, and only non-form callers can send
      // a non-object row anyway.
      errors.push({ path, message: META_FIELD_MESSAGES.invalid });
      continue;
    }
    if (isBlankRow(field.subFields, rawRow)) continue;
    const next: Record<string, JsonValue> = {};
    for (const sf of field.subFields) {
      const cell = await runFieldPipeline(
        sf,
        rawRow[sf.key],
        addressable ? `${path}.${String(idx)}.${sf.key}` : path,
        cellMode(sf, rawRow, mode),
      );
      errors.push(...cell.errors);
      if (cell.errors.length === 0 && cell.value !== undefined) {
        next[sf.key] = cell.value;
      }
    }
    rows.push(next);
  }
  if (errors.length > 0) return { result: { errors }, rows };
  return { rows };
}

// The deletion sits after the bounds on purpose: `.min()` binds an optional
// field too. Row counts are business rules, skipped in draft.
function checkRowCount(
  field: RepeaterMetaBoxField,
  rows: readonly unknown[],
  path: string,
  mode: FieldPipelineMode,
): FieldPipelineResult | undefined {
  const errors: MetaFieldError[] = [];
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
  if (rows.length === 0) return { errors: [], isDeletion: true };
  return undefined;
}

// Structural normalization that must succeed before the declarative
// constraints can inspect the value — a multi select's array shape and
// de-dupe live here so `checkConstraints` sees the canonical form.
type Normalized =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly error: MetaFieldError };

function normalizeValue(
  field: MetaBoxField,
  value: JsonValue,
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
  value: JsonValue,
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
  value: JsonValue,
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
  value: JsonValue,
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
function isEmptyValue(value: JsonValue): boolean {
  if (value === "") return true;
  return Array.isArray(value) && value.length === 0;
}
