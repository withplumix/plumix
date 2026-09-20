import { EMAIL_REGEX } from "valibot";

import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type {
  GroupMetaBoxField,
  MetaBoxField,
  MetaBoxFieldOption,
  ReferenceTarget,
  RepeaterMetaBoxField,
  RichtextMetaBoxField,
  TemporalInputType,
} from "../../plugin/manifest.js";
import type { ResolvedMeta } from "./core.js";
import { isJsonArray, isJsonObject } from "../../json.js";
import { HEX_COLOR } from "../../plugin/fields/color.js";
import { isFieldVisible } from "../../plugin/fields/condition.js";
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
import { coerceValue, decodeJsonValue, extractStringId } from "./coerce.js";
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
    // Re-decode and re-normalize the callback's output. The descriptor types
    // the return as `JsonValue` but nothing enforces that at runtime, so the
    // transform clears the same gates its input did: the storage shape, then
    // the declared ones (link URL safety, hex format, option-array shape).
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
    // The blank check re-runs in the CALLER's mode, so clearing a
    // `.required()` group through a sanitizer is the same rejection as
    // clearing it by hand. The members below are re-walked in draft: the
    // security gates (safe href, the rich-text allowlist) bind whatever
    // ends up stored, whoever put it there, while the business rules stay
    // skipped — that is what "members are not re-validated" means.
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

/**
 * A group all of whose members read empty is an authoring affordance, not
 * data, so it is dropped (optional) or rejected at the group path
 * (required) without ever validating members. Runs BEFORE member
 * validation: otherwise a `.required()` member on an untouched optional
 * group would error and make the group impossible to clear. "Empty" is
 * strictly `null` / `undefined` / `""` per `isBlankRow`; `0` / `false`
 * are real values.
 */
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

/** One pass over the members, each settled at its own path. */
async function settleGroupMembers(
  field: GroupMetaBoxField,
  value: Readonly<Record<string, JsonValue>>,
  path: string,
  mode: FieldPipelineMode,
): Promise<{
  readonly result?: FieldPipelineResult;
  readonly members: Record<string, JsonValue>;
}> {
  // A populated group keeps every member (blank cells included) and
  // validates each — a required member left empty in a non-empty group
  // is a real error, just as in a non-blank repeater row.
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

/**
 * The parent `.sanitize()` of a group or repeater. Runs terminally —
 * after every sub-field has been settled — so the callback sees the
 * value that would otherwise have been stored, rather than raw input
 * where a cell could still be a `Date` or a hydrated reference payload.
 *
 * Checks the output's shape and its declared keys only. Re-settling the
 * cells is the caller's job, because what "settle" means differs between
 * the two composites.
 */
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
  // Safety: `isCompositeShape` has just proved `decoded` is the
  // composite's own shape, which is what `T` is instantiated with at both
  // call sites — an array of rows for a repeater, one member object for a
  // group.
  return { value: decoded as T };
}

/**
 * The parent `.validate()` of a group or repeater. Runs last of all:
 * after the sub-fields, after `.sanitize()`, and after the composite's
 * own count bounds, so a cross-row or cross-member rule reasons about
 * exactly what will be stored. Strict-mode only, like every other
 * `.validate()` — a draft may be mid-authoring.
 *
 * One consequence worth knowing: a condition-hidden cell inside the
 * composite was only draft-checked (see `cellMode`), so the value handed
 * to a parent validator may contain cells that never met their own strict
 * constraints. That is already true of what gets stored; the hook only
 * makes it reachable.
 */
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

/**
 * A buggy callback rounds to a generic `invalid` for the editor, which
 * has no vocabulary for "the plugin threw"; the diagnostic trail stays in
 * the server log.
 */
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

/**
 * Whether a sanitizer's output still has the composite's declared shape:
 * an array of rows for a repeater, one object for a group, every key
 * belonging to the declared schema. The row ceiling is re-applied because
 * a sanitizer can grow the list after the pre-walk bound was measured.
 */
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

/**
 * The mode a cell of a row / group runs under: `draft` when the bag's own
 * values hide it, so business rules can't fail on an input nobody can open —
 * while coercion, `.sanitize()` and the safety gates still run, and the value
 * is kept rather than dropped. Losing it would be worse than at box level,
 * where a hidden key's stored value survives untouched: a row is rewritten
 * whole on every save, so a dropped cell is gone for good.
 *
 * Visibility is `isFieldVisible`, not `isConditionHidden`: a row is always a
 * complete object, so an absent driver key means unset, and the admin judges
 * the same rows with the same function. `isConditionHidden`'s bail-out on a
 * missing driver is for partial box-level patches, and here it would validate
 * the very cells the admin hides.
 */
function cellMode(
  field: MetaBoxField,
  bag: ResolvedMeta,
  mode: FieldPipelineMode,
): FieldPipelineMode {
  return isFieldVisible(field, bag) ? mode : "draft";
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
 * Recurse the pipeline into each kept row's cells, then the composite
 * hooks. Error paths use the caller's ORIGINAL row indices — the admin
 * form still shows the blank rows the strip removed, so a post-strip
 * index would address the wrong input.
 *
 * Row-count bounds are checked over the rows that will actually be
 * stored, so they hold whether the rows came straight from the strip or
 * from a `.sanitize()` that trimmed or padded them. The empty case is
 * settled ahead of the hooks so that neither runs on a deletion.
 */
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
  // Only the EMPTY case is settled before the hooks, so neither runs on a
  // deletion. The bounds themselves wait: a sanitizer that trims to
  // `.max()` or pads to `.min()` is exactly what the hook is for, and
  // judging its input would make both unwritable.
  if (rows.length === 0) {
    const emptied = checkRowCount(field, rows, path, mode);
    if (emptied) return emptied;
  }

  if (field.sanitize) {
    const sanitized = applyCompositeSanitize(field, field.sanitize, rows, path);
    if (sanitized.result) return sanitized.result;
    // Re-settle in the same shape the input got: the blank strip and the
    // security gates (safe href, the rich-text allowlist) bind whatever
    // ends up stored, whoever put it there, while the business rules stay
    // skipped — that is what "cells are not re-validated" means. The row
    // counts are then re-checked in the CALLER's mode, so `.min()` still
    // binds a list a de-dupe cut down.
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

/**
 * One pass over the rows: drop the blank ones, settle each kept row's
 * cells.
 *
 * `addressable` says whether row positions still name something the
 * caller sent. On the first pass they do, so a cell error carries
 * `${path}.${index}.${key}` and the admin can open the offending row —
 * using the ORIGINAL index, because the form still shows the blank rows
 * the strip removed. After a `.sanitize()` they do not: a reorder or a
 * de-dupe has moved everything, so an indexed path would highlight the
 * wrong row and show the author a value that is fine. Those errors
 * anchor on the repeater itself, the same treatment a non-object row
 * gets and for the same reason.
 */
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

/**
 * The repeater's count bounds, and the deletion an empty list resolves
 * to. Returns a `result` when the field is settled without a value —
 * bounds errors, or the deletion — and `undefined` when the rows stand.
 *
 * The deletion sits AFTER the bounds on purpose: `.min()` binds an
 * optional field too, so short-circuiting first would discard a declared
 * constraint. An emptied repeater is the same authoring gesture the
 * group's all-blank value has always been.
 *
 * Row counts are business rules — a draft may be mid-authoring with too
 * few (or a transient too many) rows. Cell-level structural errors still
 * surface in draft mode.
 */
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
