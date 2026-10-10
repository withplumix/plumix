import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { Capability } from "../access/contract/capability.js";
import type { AppContext } from "../context/app-context.js";
import type { JsonObject, JsonValue } from "../json.js";
import type { MetaFieldValues } from "../plugin/fields/condition.js";
import type {
  HydratedReference,
  LookupAdapter,
  ReferenceHydrationShapes,
} from "../plugin/lookup.js";
import type {
  MetaBoxField,
  ReferenceTarget,
  TemporalInputType,
  TemporalMetaBoxField,
} from "../plugin/manifest.js";
import type { ConflictErrors } from "../rpc-errors.js";
import type { ResolvedMeta } from "./contract/bags.js";
import type { FieldPipelineMode, MetaFieldError } from "./field-pipeline.js";
import { declarePageTags } from "../cdn/contract/page-tags.js";
import { memoBatch } from "../context/memo.js";
import { and, chunkForD1, eq } from "../db/index.js";
import { metaJsonPath } from "../db/meta-path.js";
import { isJsonArray, isJsonObject } from "../json.js";
import {
  conditionReadsAny,
  isConditionHidden,
  isFieldVisible,
  structurallyEqual,
} from "../plugin/fields/condition.js";
import { anchorTemporalUtc } from "../plugin/manifest.js";
import { coerceValue, extractStringId } from "./coerce.js";
import { META_FIELD_MESSAGES } from "./contract/field-messages.js";
import { MetaReferenceError } from "./errors.js";
import {
  healReferenceValue,
  isGroupField,
  isRepeaterField,
  referenceTargetOf,
  runFieldPipeline,
} from "./field-pipeline.js";

// 256 KiB fits any realistic plugin config while bounding adversarial payloads.
const MAX_META_VALUE_BYTES = 256 * 1024;

/**
 * Not JSON: values stay unproven until the field pipeline normalizes them into
 * the stored `JsonObject`.
 */
export type MetaInput = Readonly<Record<string, unknown>>;

/**
 * `upserts` holds decoded values. `validateMetaReferences` mutates it to
 * normalize references; every other caller treats it as read-only.
 */
export interface MetaPatch {
  readonly upserts: Map<string, JsonValue>;
  readonly deletes: readonly string[];
}

// A public contract: admin UIs and plugin tests match on `data.reason`.
type MetaSanitizationReason =
  "not_registered" | "invalid_value" | "value_too_large";

export class MetaSanitizationError extends Error {
  static {
    MetaSanitizationError.prototype.name = "MetaSanitizationError";
  }

  readonly key: string;
  readonly reason: MetaSanitizationReason;

  private constructor(key: string, reason: MetaSanitizationReason) {
    super(`meta key "${key}" failed sanitization: ${reason}`);
    this.key = key;
    this.reason = reason;
  }

  static notRegistered(ctx: { key: string }): MetaSanitizationError {
    return new MetaSanitizationError(ctx.key, "not_registered");
  }

  static invalidValue(ctx: { key: string }): MetaSanitizationError {
    return new MetaSanitizationError(ctx.key, "invalid_value");
  }

  static valueTooLarge(ctx: { key: string }): MetaSanitizationError {
    return new MetaSanitizationError(ctx.key, "value_too_large");
  }
}

/**
 * Standard payload for `<entity>:meta_changed` actions. `set` is the
 * decoded key → value map of upserts; `removed` is the list of
 * cleared keys.
 */
export interface MetaChanges {
  readonly set: JsonObject;
  readonly removed: readonly string[];
}

/**
 * Carries every `{ path, message }` across the patch so the admin form can
 * address each input in one round-trip. Nothing is written when this throws.
 */
export class MetaValidationError extends Error {
  static {
    MetaValidationError.prototype.name = "MetaValidationError";
  }

  readonly errors: readonly MetaFieldError[];

  constructor(errors: readonly MetaFieldError[]) {
    super(
      `meta validation failed: ${errors.map((error) => error.path).join(", ")}`,
    );
    this.errors = errors;
  }
}

/**
 * `null`/`undefined` values are deletion requests. Pipeline rejections
 * aggregate into one `MetaValidationError`; unregistered keys and oversized
 * values fail fast with `MetaSanitizationError`.
 */
export async function sanitizeMetaInput(
  findField: (key: string) => MetaBoxField | undefined,
  input: MetaInput | undefined,
  mode: FieldPipelineMode = "strict",
  target?: MetaPatchTarget,
): Promise<MetaPatch | null> {
  if (input === undefined) return null;
  const upserts = new Map<string, JsonValue>();
  const deletes: string[] = [];
  const fieldErrors: MetaFieldError[] = [];
  const hiddenKeys =
    target &&
    hiddenPatchKeys(
      target,
      findField,
      await settleForConditions(findField, input),
    );
  for (const [key, rawValue] of Object.entries(input)) {
    const field = findField(key);
    if (!field) {
      // Deleting a key the field system doesn't own is a harmless no-op;
      // unknown upserts still reject.
      if (rawValue === null || rawValue === undefined) continue;
      throw MetaSanitizationError.notRegistered({ key });
    }
    // Without a target there is no row to judge against, so the patch's own
    // drivers are all there is to go on.
    const hidden = hiddenKeys
      ? hiddenKeys.has(key)
      : isConditionHidden(field, input);
    if (hidden) continue;
    const result = await runFieldPipeline(field, rawValue, key, mode);
    if (result.errors.length > 0) {
      fieldErrors.push(...result.errors);
      continue;
    }
    if (result.isDeletion === true) {
      deletes.push(key);
      continue;
    }
    // The driver rejects binding `undefined` into `json_set`, so a
    // `.sanitize()` returning `undefined` skips the key.
    if (result.value === undefined) continue;
    assertEncodedSize(key, result.value);
    upserts.set(key, result.value);
  }
  if (target && mode === "strict") {
    fieldErrors.push(
      ...(await validateConditionDependents(target, input, {
        upserts,
        deletes,
      })),
    );
  }
  if (fieldErrors.length > 0) {
    throw new MetaValidationError(fieldErrors);
  }
  return { upserts, deletes };
}

/**
 * A condition can't be judged from a patch alone: a driver it omits is whatever
 * `stored` holds, and `auth` limits which fields the author answers for.
 */
export interface MetaPatchTarget {
  readonly stored: JsonObject;
  readonly fields: readonly MetaBoxField[];
  readonly auth: { can(capability: Capability): boolean };
}

// The stored meta with the patch laid over it, as conditions will see it; a
// null or undefined value is a deletion.
function overlayMetaPatch(
  target: MetaPatchTarget,
  input: MetaInput,
): MetaFieldValues {
  const next: Record<string, unknown> = { ...target.stored };
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

// Conditions judge the settled value, as the publish gate does; a raw `"10"`
// would disagree with it. A key that fails to settle stays raw for the real
// pass.
async function settleForConditions(
  findField: (key: string) => MetaBoxField | undefined,
  input: MetaInput,
): Promise<MetaInput> {
  const settled: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    const field = findField(key);
    if (!field || raw === null || raw === undefined) {
      settled[key] = raw;
      continue;
    }
    const result = await runFieldPipeline(field, raw, key, "draft");
    // A `.sanitize()` that yields nothing leaves the key unwritten, as the
    // real pass does, so the row keeps its stored value.
    if (result.isDeletion === true) settled[key] = null;
    else if (result.errors.length > 0) settled[key] = raw;
    else if (result.value !== undefined) settled[key] = result.value;
  }
  return settled;
}

// Settled to a fixpoint: a dropped write's discarded value must not hide a
// field visible under what actually gets stored. A chain settles within one
// round per key.
function hiddenPatchKeys(
  target: MetaPatchTarget,
  findField: (key: string) => MetaBoxField | undefined,
  settled: MetaInput,
): ReadonlySet<string> {
  const keys = Object.keys(settled);
  let hidden = new Set<string>();
  for (let round = 0; round <= keys.length; round++) {
    const surviving = Object.fromEntries(
      Object.entries(settled).filter(([key]) => !hidden.has(key)),
    );
    const shown = overlayMetaPatch(target, surviving);
    const next = new Set(
      keys.filter((key) => {
        const field = findField(key);
        return field !== undefined && !isFieldVisible(field, shown);
      }),
    );
    if (
      next.size === hidden.size &&
      [...next].every((key) => hidden.has(key))
    ) {
      return hidden;
    }
    hidden = next;
  }
  // Never settled: the conditions form a cycle, so drop nothing and let every
  // write answer to the full pipeline.
  return new Set();
}

// A field a changed driver switches visible without being supplied is this
// edit's to fix; a co-author's older drift elsewhere is not.
async function validateConditionDependents(
  target: MetaPatchTarget,
  input: MetaInput,
  outcome: MetaPatch,
): Promise<MetaFieldError[]> {
  // Judged by what the edit stores: a write to a hidden field is dropped, so
  // it switches nothing on.
  const written: Record<string, unknown> = Object.fromEntries(outcome.upserts);
  for (const key of outcome.deletes) written[key] = null;
  const before = overlayMetaPatch(target, {});
  const after = overlayMetaPatch(target, written);
  const changed = new Set(
    Object.keys(written).filter(
      (key) => !structurallyEqual(before[key], after[key]),
    ),
  );
  if (changed.size === 0) return [];
  const errors: MetaFieldError[] = [];
  for (const field of target.fields) {
    // A key the patch sent has had its own pass, whether it was written,
    // dropped as hidden, or rejected.
    if (Object.hasOwn(input, field.key)) continue;
    // The rule `sanitizePromotedEntryMeta` applies at publish, for the same
    // reason: an author cannot fix a field they are not allowed to write.
    if (field.capability && !target.auth.can(field.capability)) continue;
    if (!conditionReadsAny(field, changed)) continue;
    if (!isFieldVisible(field, after)) continue;
    // The value is judged as stored, as the publish gate judges it.
    const result = await runFieldPipeline(
      field,
      target.stored[field.key],
      field.key,
      "strict",
    );
    errors.push(...result.errors);
  }
  return errors;
}

/**
 * One place, so the wire shape can't drift between the write path and the
 * publish gate.
 */
export function metaValidationConflict(
  error: MetaValidationError,
  errors: ConflictErrors,
): Error {
  return errors.CONFLICT({
    data: {
      reason: "meta_invalid_value",
      key: error.errors[0]?.path.split(".")[0],
      errors: [...error.errors],
    },
  });
}

export async function sanitizeMetaForRpc(
  target: MetaPatchTarget,
  input: MetaInput | undefined,
  errors: ConflictErrors,
  mode: FieldPipelineMode = "strict",
): Promise<MetaPatch | null> {
  const { findField } = metaScope(target.fields);
  try {
    return await sanitizeMetaInput(findField, input, mode, target);
  } catch (error) {
    if (error instanceof MetaValidationError) {
      throw metaValidationConflict(error, errors);
    }
    if (error instanceof MetaSanitizationError) {
      throw errors.CONFLICT({
        data: { reason: `meta_${error.reason}`, key: error.key },
      });
    }
    throw error;
  }
}

/**
 * Walks field definitions, so a required field absent from the bag is caught.
 * Only `touched` keys are re-run through `.sanitize()`; the rest return as
 * stored.
 */
export async function validateAndPromoteMetaBag(
  fields: readonly MetaBoxField[],
  bag: JsonObject,
  touched: ReadonlySet<string>,
): Promise<JsonObject> {
  const out: Record<string, JsonValue> = {};
  const owned = new Set<string>();
  const fieldErrors: MetaFieldError[] = [];
  for (const field of fields) {
    owned.add(field.key);
    // A hidden field can't be required, but its stored value is kept
    // untouched, or it would be lost when the driver flips back.
    if (!isFieldVisible(field, bag)) {
      const stored = bag[field.key];
      if (stored !== undefined) out[field.key] = stored;
      continue;
    }
    const result = await runFieldPipeline(field, bag[field.key], field.key);
    if (result.errors.length > 0) {
      fieldErrors.push(...result.errors);
      continue;
    }
    // The pipeline decodes input, and a key the author never sent is not
    // input.
    if (!touched.has(field.key)) {
      const stored = bag[field.key];
      if (stored !== undefined) out[field.key] = stored;
      continue;
    }
    if (result.isDeletion === true) continue;
    if (result.value !== undefined) out[field.key] = result.value;
  }
  for (const [key, value] of Object.entries(bag)) {
    if (!owned.has(key)) out[key] = value;
  }
  if (fieldErrors.length > 0) throw new MetaValidationError(fieldErrors);
  return out;
}

/**
 * Throws `invalid_value` for any id that is gone or out of scope. Runs in a
 * separate query from `applyMetaPatch`; wrap both in `ctx.db.transaction()`
 * if a concurrent delete matters.
 */
export async function validateMetaReferences(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  patch: MetaPatch,
): Promise<void> {
  const groups = new Map<string, ReferenceGroup>();
  for (const [key, value] of patch.upserts) {
    const field = findField(key);
    const target = referenceTargetOf(field);
    if (target) {
      const registered = ctx.plugins.lookupAdapters.get(target.kind);
      if (!registered) {
        throw MetaSanitizationError.invalidValue({ key });
      }
      const ids = referenceIdsForValidation(
        key,
        value,
        target,
        fieldMax(field),
      );
      // Normalize eagerly: a validation failure below aborts the whole save,
      // so a rewritten patch never persists on the failure path.
      const normalized = target.multiple ? ids : ids[0];
      if (normalized !== undefined) patch.upserts.set(key, normalized);
      const group = upsertGroup(groups, target, registered);
      for (const id of ids) group.ids.add(id);
      group.contributions.push({ errorKey: key, ids });
      continue;
    }
    // Composite rows and members can hold references at any depth; errors
    // attribute to the top-level key.
    if (isRepeaterField(field) || isGroupField(field)) {
      collectCompositeReferences(ctx, key, key, field, value, groups);
    }
  }
  for (const group of groups.values()) {
    if (group.ids.size === 0) continue;
    const liveIds = await fetchLiveIds(
      ctx,
      group.registered,
      group.scope,
      group.ids,
      "validateMetaReferences",
    );
    for (const contribution of group.contributions) {
      for (const id of contribution.ids) {
        if (!liveIds.has(id)) {
          if (contribution.diagnostic !== undefined) {
            // The only place the nested sub-path surfaces. `JSON.stringify`
            // escapes control characters so a user-supplied id can't poison
            // the log.
            console.error(
              `[plumix] meta composite ${JSON.stringify(contribution.errorKey)} ` +
                `at ${JSON.stringify(contribution.diagnostic.path)} ` +
                `references missing id ${JSON.stringify(id)}`,
            );
          }
          throw MetaSanitizationError.invalidValue({
            key: contribution.errorKey,
          });
        }
      }
    }
  }
}

function collectCompositeReferences(
  ctx: AppContext,
  topKey: string,
  path: string,
  field: MetaBoxField,
  value: unknown,
  groups: Map<string, ReferenceGroup>,
): void {
  if (isRepeaterField(field)) {
    if (!Array.isArray(value)) return;
    for (const [rowIdx, row] of value.entries()) {
      if (!isPlainObject(row)) continue;
      collectMemberReferences(
        ctx,
        topKey,
        `${path}.${String(rowIdx)}`,
        field.subFields,
        row,
        groups,
      );
    }
    return;
  }
  if (isGroupField(field)) {
    if (!isPlainObject(value)) return;
    collectMemberReferences(ctx, topKey, path, field.fields, value, groups);
  }
}

function collectMemberReferences(
  ctx: AppContext,
  topKey: string,
  path: string,
  members: readonly MetaBoxField[],
  container: ResolvedMeta,
  groups: Map<string, ReferenceGroup>,
): void {
  for (const member of members) {
    const memberPath = `${path}.${member.key}`;
    const subValue = container[member.key];
    const target = referenceTargetOf(member);
    if (target) {
      if (subValue === undefined || subValue === null) continue;
      const registered = ctx.plugins.lookupAdapters.get(target.kind);
      if (!registered) {
        throw MetaSanitizationError.invalidValue({ key: topKey });
      }
      const ids = referenceIdsForValidation(
        topKey,
        subValue,
        target,
        fieldMax(member),
      );
      // Normalize the cell in place — the top-level upsert value is the
      // live storage shape, so mutating an object inside it is what the
      // caller serializes.
      container[member.key] = target.multiple ? ids : ids[0];
      const group = upsertGroup(groups, target, registered);
      for (const id of ids) group.ids.add(id);
      group.contributions.push({
        errorKey: topKey,
        ids,
        diagnostic: { path: memberPath },
      });
      continue;
    }
    if (isRepeaterField(member) || isGroupField(member)) {
      collectCompositeReferences(
        ctx,
        topKey,
        memberPath,
        member,
        subValue,
        groups,
      );
    }
  }
}

function upsertGroup(
  groups: Map<string, ReferenceGroup>,
  target: ReferenceTarget,
  registered: { readonly adapter: LookupAdapter },
): ReferenceGroup {
  const groupKey = referenceGroupKey(target);
  let group = groups.get(groupKey);
  if (!group) {
    group = {
      registered,
      scope: target.scope,
      ids: new Set(),
      contributions: [],
    };
    groups.set(groupKey, group);
  }
  return group;
}

interface ReferenceGroup {
  readonly registered: { readonly adapter: LookupAdapter };
  readonly scope: unknown;
  // De-duped ids across every field in this group — one query
  // resolves them all regardless of how many fields reference them.
  readonly ids: Set<string>;
  // Per-contribution error attribution. Top-level and
  // nested-in-repeater contributions share this shape.
  readonly contributions: ReferenceContribution[];
}

interface ReferenceContribution {
  readonly errorKey: string;
  readonly ids: readonly string[];
  /**
   * Diagnostic only: the wire error keys on the top-level field, but server
   * logs name the offending cell.
   */
  readonly diagnostic?: {
    readonly path: string;
  };
}

// Above this the live-id fetch throws rather than silently truncating; only
// reached when many fields share `(kind, scope)`.
const MAX_REFERENCE_GROUP_BATCH = 1000;

/**
 * `::` can't collide: lookup kinds are constrained to `[a-z][a-z0-9_-]{0,63}`.
 * A scope with unstable key order only costs an extra query.
 */
export function referenceGroupKey(target: ReferenceTarget): string {
  try {
    return `${target.kind}::${JSON.stringify(target.scope ?? null)}`;
  } catch (cause) {
    throw MetaReferenceError.scopeNotSerializable(target.kind, cause);
  }
}

// Throwing beats truncation, which would either reject valid writes or hide
// live targets.
async function fetchLiveIds(
  ctx: AppContext,
  registered: { readonly adapter: LookupAdapter },
  scope: unknown,
  ids: ReadonlySet<string>,
  callsite: string,
): Promise<ReadonlySet<string>> {
  if (ids.size > MAX_REFERENCE_GROUP_BATCH) {
    throw MetaReferenceError.batchSizeExceeded(
      callsite,
      ids.size,
      MAX_REFERENCE_GROUP_BATCH,
    );
  }
  const idList = [...ids];
  const rows = await registered.adapter.list(ctx, {
    ids: idList,
    scope,
    limit: idList.length,
  });
  return new Set(rows.map((row) => row.id));
}

// Bounds one query's row count and response size; a field may declare a
// lower `max`.
const HARD_MULTI_REFERENCE_LIMIT = 100;

// Storage is plain ids, but each slot still accepts the retired `{ id, ... }`
// shape so legacy values self-heal on the next save.
function referenceIdsForValidation(
  key: string,
  value: unknown,
  target: ReferenceTarget,
  max: number | undefined,
): readonly string[] {
  if (target.multiple) {
    if (!Array.isArray(value)) {
      throw MetaSanitizationError.invalidValue({ key });
    }
    if (value.length > HARD_MULTI_REFERENCE_LIMIT) {
      throw MetaSanitizationError.valueTooLarge({ key });
    }
    if (max !== undefined && value.length > max) {
      throw MetaSanitizationError.invalidValue({ key });
    }
    return value.map((item) => referenceItemId(key, item));
  }
  return [referenceItemId(key, value)];
}

function referenceItemId(key: string, item: unknown): string {
  if (typeof item === "string" && item !== "") return item;
  const id = extractStringId(item);
  if (id !== null && id !== "") return id;
  throw MetaSanitizationError.invalidValue({ key });
}

function fieldMax(field: MetaBoxField | undefined): number | undefined {
  return (field as { readonly max?: number } | undefined)?.max;
}

/**
 * RPC-shaped wrapper around `validateMetaReferences` — same envelope
 * translation as `sanitizeMetaForRpc`. Procedures call this right
 * after `sanitizeMetaForRpc` so reference validation rides on the
 * same `meta_invalid_value` error surface authors already match on.
 */
export async function validateMetaReferencesForRpc(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  patch: MetaPatch,
  errors: ConflictErrors,
): Promise<void> {
  try {
    await validateMetaReferences(ctx, findField, patch);
  } catch (error) {
    if (error instanceof MetaSanitizationError) {
      throw errors.CONFLICT({
        data: {
          reason: `meta_${error.reason}`,
          key: error.key,
          // Reference failures address the top-level field (row/subKey
          // detail stays in the server log) — shipping them under
          // `errors` too lets the admin form surface them inline.
          errors: [
            { path: error.key, message: META_FIELD_MESSAGES.invalidOption },
          ],
        },
      });
    }
    throw error;
  }
}

type PathSegment = string | number;

interface ReferenceOccurrence {
  /**
   * `[key, rowIdx, subKey, …]` for nested references; the last segment is
   * always the leaf object key.
   */
  readonly path: readonly PathSegment[];
  readonly target: ReferenceTarget;
  readonly value: unknown;
}

// `.returns("id")` reads the bare stored id, so the walk skips it.
function readsRawReferenceId(field: MetaBoxField | undefined): boolean {
  return field !== undefined && "returns" in field && field.returns === "id";
}

function* referenceOccurrences(
  entries: Iterable<readonly [string, unknown]>,
  findField: (key: string) => MetaBoxField | undefined,
): Generator<ReferenceOccurrence> {
  for (const [key, value] of entries) {
    yield* fieldOccurrences([key], findField(key), value);
  }
}

// Recurse a single field's decoded value, yielding reference occurrences
// with their full path. Nested field definitions come straight off the
// composite field (`subFields` / `fields`) — `findField` only resolves
// top-level keys.
function* fieldOccurrences(
  path: readonly PathSegment[],
  field: MetaBoxField | undefined,
  value: unknown,
): Generator<ReferenceOccurrence> {
  const target = referenceTargetOf(field);
  if (target) {
    // `.returns("id")` opts out of the resolution join at any depth —
    // leave the stored id(s) untouched (no resolve, no orphan-strip).
    if (!readsRawReferenceId(field)) yield { path, target, value };
    return;
  }
  if (isRepeaterField(field)) {
    if (!Array.isArray(value)) return;
    for (const [rowIdx, row] of value.entries()) {
      if (!isPlainObject(row)) continue;
      for (const subField of field.subFields) {
        yield* fieldOccurrences(
          [...path, rowIdx, subField.key],
          subField,
          row[subField.key],
        );
      }
    }
    return;
  }
  if (isGroupField(field)) {
    if (!isPlainObject(value)) return;
    for (const member of field.fields) {
      yield* fieldOccurrences([...path, member.key], member, value[member.key]);
    }
  }
}

/**
 * A decoded meta bag plus the field lookup that scopes it — the unit
 * `resolveMetaBags` operates on. Multi-entity responses pass one per
 * entity so ids aggregate across the whole response.
 */
export interface ResolvableBag {
  readonly findField: (key: string) => MetaBoxField | undefined;
  readonly decoded: ResolvedMeta;
}

/** Single-bag convenience over {@link resolveMetaBags}. */
export async function resolveMetaReferences(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  decoded: ResolvedMeta,
): Promise<ResolvedMeta> {
  const [bag] = await resolveMetaBags(ctx, [{ findField, decoded }]);
  // resolveMetaBags returns one bag per input by construction.
  return bag ?? decoded;
}

// Adapters without `hydrate` yield only the live-id set. Either way, an id
// absent from the result is an orphan.
type GroupResolution =
  | {
      readonly kind: "hydrated";
      readonly byId: ReadonlyMap<string, HydratedReference>;
    }
  | { readonly kind: "ids"; readonly liveIds: ReadonlySet<string> };

export async function resolveMetaBags(
  ctx: AppContext,
  bags: readonly ResolvableBag[],
): Promise<ResolvedMeta[]> {
  // Pass 1. Candidates carry their bags so Pass 3 needs no registry re-lookups.
  interface Candidate {
    readonly outBag: ResolvedMeta;
    // Kept for lazy copy-on-write.
    readonly decoded: ResolvedMeta;
    readonly path: readonly PathSegment[];
    readonly multiple: boolean;
    readonly groupKey: string;
    readonly ids: readonly string[];
  }
  const candidates: Candidate[] = [];
  const groups = new Map<
    string,
    {
      readonly registered: { readonly adapter: LookupAdapter };
      readonly target: ReferenceTarget;
      readonly ids: Set<string>;
    }
  >();
  const out: ResolvedMeta[] = [];
  for (const bag of bags) {
    const outBag: ResolvedMeta = { ...bag.decoded };
    out.push(outBag);
    for (const occ of referenceOccurrences(
      Object.entries(bag.decoded),
      bag.findField,
    )) {
      const registered = ctx.plugins.lookupAdapters.get(occ.target.kind);
      if (!registered) continue;
      const ids = referenceCandidateIds(occ.target, occ.value);
      if (ids === null) continue; // non-array multi / non-string single — leave untouched
      const groupKey = referenceGroupKey(occ.target);
      candidates.push({
        outBag,
        decoded: bag.decoded,
        path: occ.path,
        multiple: occ.target.multiple === true,
        groupKey,
        ids,
      });
      if (ids.length === 0) continue;
      let group = groups.get(groupKey);
      if (!group) {
        group = { registered, target: occ.target, ids: new Set() };
        groups.set(groupKey, group);
      }
      for (const id of ids) group.ids.add(id);
    }
  }

  // Pass 2: one `hydrate({ ids })` (or `list({ ids })` fallback) per
  // group, keyed for O(1) apply lookup. Groups are independent, so a
  // bag mixing entry + user + media refs resolves them concurrently.
  const resolutions = new Map<string, GroupResolution>(
    await Promise.all(
      [...groups].map(
        async ([groupKey, group]): Promise<[string, GroupResolution]> => [
          groupKey,
          await resolveGroup(
            ctx,
            group.registered.adapter,
            group.target,
            group.ids,
          ),
        ],
      ),
    ),
  );

  // Pass 3. Multi refs stay dense and in stored order; nested slots
  // copy-on-write so callers' bags stay untouched.
  const emptyResolution: GroupResolution = { kind: "ids", liveIds: new Set() };
  for (const candidate of candidates) {
    const { outBag, decoded, path, multiple, groupKey, ids } = candidate;
    const resolution = resolutions.get(groupKey) ?? emptyResolution;
    const slot = takeWritableSlot(outBag, decoded, path);
    if (!slot) continue;
    applyResolutionToSlot(slot.parent, slot.leafKey, multiple, ids, resolution);
  }
  return out;
}

/**
 * Resolves through the adapter's batched `hydrate` and folds each entity's
 * cache tag into the page. Gone or out-of-scope ids are dropped; an
 * unregistered kind or an adapter without `hydrate` yields `[]`.
 */
export async function resolveReferences<
  K extends keyof ReferenceHydrationShapes,
>(
  ctx: AppContext,
  kind: K,
  ids: readonly string[],
  options: { readonly scope?: unknown } = {},
): Promise<ReferenceHydrationShapes[K][]> {
  const registered = ctx.plugins.lookupAdapters.get(kind);
  if (!registered?.adapter.hydrate) return [];
  const unique = new Set(ids.filter((id) => id !== ""));
  if (unique.size === 0) return [];
  const resolution = await resolveGroup(
    ctx,
    registered.adapter,
    { kind, scope: options.scope },
    unique,
  );
  if (resolution.kind !== "hydrated") return [];
  return ids
    .map((id) => resolution.byId.get(id))
    .filter((p): p is ReferenceHydrationShapes[K] => p !== undefined);
}

/**
 * An unregistered kind, or an adapter without `hydrate`, yields an empty map,
 * so every id in the group reads as an orphan.
 */
export async function hydrateReferenceGroup(
  ctx: AppContext,
  target: ReferenceTarget,
  ids: ReadonlySet<string>,
): Promise<ReadonlyMap<string, HydratedReference>> {
  const registered = ctx.plugins.lookupAdapters.get(target.kind);
  if (!registered?.adapter.hydrate || ids.size === 0) return new Map();
  const resolution = await resolveGroup(ctx, registered.adapter, target, ids);
  return resolution.kind === "hydrated" ? resolution.byId : new Map();
}

// `ctx.memo` is shared by every derived context, and `hydrate` clamps rows by
// `user.id`, so the asker belongs in the key. Scopes are sorted because they
// narrow as a set.
function principalKey(ctx: AppContext): string {
  const scopes = ctx.tokenScopes === null ? null : [...ctx.tokenScopes].sort();
  return JSON.stringify([ctx.user?.id ?? null, scopes]);
}

// Chunked rather than thrown: a response-level group can legitimately exceed
// one query's id limit, and a read-path throw would kill the render.
async function resolveGroup(
  ctx: AppContext,
  adapter: LookupAdapter,
  target: ReferenceTarget,
  ids: ReadonlySet<string>,
): Promise<GroupResolution> {
  const { scope } = target;
  const idList = [...ids];
  if (adapter.hydrate) {
    // Bound, not destructured: `hydrate` is declared as a method, so an
    // adapter may reach for `this`.
    const hydrate = adapter.hydrate.bind(adapter);
    // The memo keeps a later batch in the same request from re-hydrating ids.
    // A JSON tuple key, because a scope serialized into `groupKey` could
    // spill into joined text.
    const key = principalKey(ctx);
    const groupKey = referenceGroupKey(target);
    // Tagged by id, so the entity's own write in this request drops the
    // entry — a memoized miss included (#2517).
    const tagsFor = (id: string): readonly string[] =>
      adapter.embeddedCacheTags?.(id) ?? [];
    const payloads = await memoBatch(
      ctx.memo,
      idList,
      (id) => `core:reference:${JSON.stringify([key, groupKey, id])}`,
      async (missing) => {
        const loaded = new Map<string, HydratedReference>();
        for (const chunk of chunkForD1(missing)) {
          for (const payload of await hydrate(ctx, { ids: chunk, scope })) {
            loaded.set(payload.id, payload);
          }
        }
        return loaded;
      },
      tagsFor,
    );
    const byId = new Map<string, HydratedReference>();
    for (const [index, id] of idList.entries()) {
      // `null` is the memoized miss: an orphan stays an orphan for the rest
      // of the request, until a write announces its id.
      const payload = payloads[index];
      if (payload === null || payload === undefined) continue;
      byId.set(id, payload);
      // Folded here rather than at the hydrate, so a batch answered from the
      // memo tags the page exactly as the batch that loaded it did.
      declarePageTags(ctx, tagsFor(id));
    }
    return { kind: "hydrated", byId };
  }
  const liveIds = new Set<string>();
  for (const chunk of chunkForD1(idList)) {
    const rows = await adapter.list(ctx, {
      ids: chunk,
      scope,
      limit: chunk.length,
    });
    for (const row of rows) liveIds.add(row.id);
  }
  return { kind: "ids", liveIds };
}

// Write one candidate's resolved value into its slot — the leaf object
// key of a container reached by walking the candidate's path.
function applyResolutionToSlot(
  slot: ResolvedMeta,
  key: string,
  multiple: boolean,
  ids: readonly string[],
  resolution: GroupResolution,
): void {
  if (multiple) {
    slot[key] =
      resolution.kind === "hydrated"
        ? ids
            .map((id) => resolution.byId.get(id))
            .filter((payload) => payload !== undefined)
        : ids.filter((id) => resolution.liveIds.has(id));
    return;
  }
  const [singleId] = ids;
  if (singleId === undefined) return; // single non-string already filtered upstream
  if (resolution.kind === "hydrated") {
    slot[key] = resolution.byId.get(singleId) ?? null;
    return;
  }
  if (!resolution.liveIds.has(singleId)) slot[key] = null;
}

// Containers cloned by an earlier candidate are reused, so sibling references
// land in one clone. Null when a hand-edited or migrated bag doesn't match the
// declared structure.
function takeWritableSlot(
  outBag: ResolvedMeta,
  decoded: ResolvedMeta,
  path: readonly PathSegment[],
): {
  readonly parent: ResolvedMeta;
  readonly leafKey: string;
} | null {
  let outContainer: unknown = outBag;
  let decContainer: unknown = decoded;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (seg === undefined) return null;
    const outChild = readContainer(outContainer, seg);
    const decChild = readContainer(decContainer, seg);
    let writable = outChild;
    // Still the shared decoded child → clone it into the output tree.
    if (outChild === decChild) {
      const clone = cloneContainer(outChild);
      if (clone === null) return null;
      writeSegment(outContainer, seg, clone);
      writable = clone;
    }
    outContainer = writable;
    decContainer = decChild;
  }
  const leaf = path[path.length - 1];
  if (typeof leaf !== "string") return null;
  if (!isPlainObject(outContainer)) return null;
  return { parent: outContainer, leafKey: leaf };
}

type MetaContainer = unknown[] | ResolvedMeta;

// A leaf or missing key reads as `undefined`: the storage shape no longer
// matches the declared structure.
function readContainer(
  container: unknown,
  seg: PathSegment,
): MetaContainer | undefined {
  let child: unknown;
  if (typeof seg === "number") {
    // `Array.isArray` widens to `any[]`; cast before indexing so the child
    // stays `unknown`.
    child = Array.isArray(container)
      ? (container as readonly unknown[])[seg]
      : undefined;
  } else {
    child = isPlainObject(container) ? container[seg] : undefined;
  }
  if (Array.isArray(child) || isPlainObject(child)) return child;
  return undefined;
}

function writeSegment(
  container: unknown,
  seg: PathSegment,
  value: unknown,
): void {
  if (typeof seg === "number") {
    if (Array.isArray(container)) container[seg] = value;
    return;
  }
  if (isPlainObject(container)) container[seg] = value;
}

// Shallow clone an array or plain object; null for any other shape (the
// path expected a container but the stored value isn't one).
function cloneContainer(value: unknown): MetaContainer | null {
  // `Array.isArray` widens to `any[]`; cast before spread so the clone
  // stays `unknown[]` rather than leaking `any` into the walk.
  if (Array.isArray(value)) return [...(value as readonly unknown[])];
  if (isPlainObject(value)) return { ...value };
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Mirrors the apply step's storage-shape guards so no work is enqueued that
// would be skipped.
function referenceCandidateIds(
  target: ReferenceTarget,
  value: unknown,
): readonly string[] | null {
  if (target.multiple) {
    if (!Array.isArray(value)) return null;
    return value.filter((id): id is string => typeof id === "string");
  }
  return typeof value === "string" ? [value] : null;
}

/**
 * A key lookup over a scope's field list, built once so decode and the
 * reference pass share it rather than each rebuilding its own.
 */
export interface MetaScope {
  readonly findField: (key: string) => MetaBoxField | undefined;
}

export function metaScope(fields: readonly MetaBoxField[]): MetaScope {
  const byKey = new Map<string, MetaBoxField>();
  // First declaration wins, matching the `find*MetaField` helpers this
  // stands in for.
  for (const field of fields) {
    if (!byKey.has(field.key)) byKey.set(field.key, field);
  }
  return { findField: (key) => byKey.get(key) };
}

/**
 * `metaScope` memoized per scope key: an archive is a hundred rows over a
 * handful of entry types, and each scope's field list costs a walk of every
 * registered meta box.
 */
export function metaScopeCache(
  listFields: (scopeKey: string) => readonly MetaBoxField[],
): (scopeKey: string) => MetaScope {
  const scopes = new Map<string, MetaScope>();
  return (scopeKey) => {
    let scope = scopes.get(scopeKey);
    if (!scope) {
      scope = metaScope(listFields(scopeKey));
      scopes.set(scopeKey, scope);
    }
    return scope;
  };
}

/**
 * Unregistered keys pass through untouched: the plugin that wrote them may be
 * uninstalled. A key storage lacks reads as absent, whatever the field's
 * `.default()`.
 */
export function decodeMetaBag(
  scope: MetaScope,
  raw: JsonObject | null | undefined,
): ResolvedMeta {
  return decodeBag(scope, raw ?? {});
}

function decodeBag(scope: MetaScope, raw: JsonObject): ResolvedMeta {
  const out: ResolvedMeta = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = scope.findField(key);
    out[key] = field ? decodeFieldValue(field, value) : value;
  }
  return out;
}

// Wider than stored JSON: `.returns("date")` yields a `Date`, and a repeater
// row or group yields a decoded bag.
type DecodedValue =
  JsonValue | Date | DecodedRow | readonly DecodedRow[] | undefined;

type DecodedRow = JsonValue | ResolvedMeta;

function decodeFieldValue(field: MetaBoxField, value: JsonValue): DecodedValue {
  const target = referenceTargetOf(field);
  if (target) return healReferenceValue(target, value);
  if (isRepeaterField(field) && isJsonArray(value)) {
    // Built once for the whole array, not once per row.
    const rowScope = metaScope(field.subFields);
    return value.map((row) =>
      isJsonObject(row) ? decodeBag(rowScope, row) : row,
    );
  }
  if (isGroupField(field) && isJsonObject(value)) {
    return decodeBag(metaScope(field.fields), value);
  }
  if (isTemporalField(field) && field.returns === "date") {
    return projectTemporalDate(field.inputType, value);
  }
  // Reads are literal: a `WHERE` over the JSON column, a raw lifecycle row
  // and `storedMeta` can't decode, so widening here would disagree with them.
  return value;
}

/** A stored bag with every unsettled value settled, and what moved. */
export interface SettledMeta {
  readonly bag: JsonObject;
  /**
   * The keys that moved, ready for a surface's own meta writer. Empty when the
   * bag was already settled, which every writer already treats as a no-op.
   */
  readonly patch: MetaPatch;
  /**
   * Keys holding a value no declared type accepts, left as stored: a human has
   * to decide what it should have been.
   */
  readonly unconvertible: readonly string[];
}

/**
 * Settles through the write path's own `coerceValue`, so a value lands on what
 * storing it would have produced. A value `coerceValue` rejects is left alone,
 * never dropped.
 */
export function settleStoredMeta(
  scope: MetaScope,
  bag: JsonObject | null | undefined,
): SettledMeta {
  const settled: Record<string, JsonValue> = {};
  const upserts = new Map<string, JsonValue>();
  const unconvertible: string[] = [];
  for (const [key, value] of Object.entries(bag ?? {})) {
    // An unregistered key belongs to a plugin that is no longer installed, so
    // its shape is unknown and it passes through, as the decode leaves it.
    const field = scope.findField(key);
    const next = field
      ? settleFieldValue(field, value)
      : { value, unconvertible: false };
    if (next.value !== value) upserts.set(key, next.value);
    if (next.unconvertible) unconvertible.push(key);
    settled[key] = next.value;
  }
  return { bag: settled, patch: { upserts, deletes: [] }, unconvertible };
}

/** A settle of one stored row, and whether the write-back landed. */
export interface SettledRow extends SettledMeta {
  /**
   * False when nothing moved, and when a save landed between the read and the
   * write — the guard leaves that row for its next read to settle.
   */
  readonly written: boolean;
}

interface SettledValue {
  readonly value: JsonValue;
  readonly unconvertible: boolean;
}

function settleFieldValue(field: MetaBoxField, value: JsonValue): SettledValue {
  // A container holding the wrong shape has no settled form, and the editor
  // can't render it — a human has to see it.
  if (
    value !== null &&
    ((isRepeaterField(field) && !isJsonArray(value)) ||
      (isGroupField(field) && !isJsonObject(value)))
  ) {
    return { value, unconvertible: true };
  }
  if (isRepeaterField(field) && isJsonArray(value)) {
    const rowScope = metaScope(field.subFields);
    const settled = value.map((row) =>
      isJsonObject(row) ? settleStoredMeta(rowScope, row) : undefined,
    );
    const unconvertible = settled.some(
      (row) => row === undefined || row.unconvertible.length > 0,
    );
    if (!settled.some((row) => row && row.patch.upserts.size > 0)) {
      return { value, unconvertible };
    }
    return {
      value: value.map((row, index) => settled[index]?.bag ?? row),
      unconvertible,
    };
  }
  if (isGroupField(field) && isJsonObject(value)) {
    const settled = settleStoredMeta(metaScope(field.fields), value);
    return {
      value: settled.patch.upserts.size > 0 ? settled.bag : value,
      unconvertible: settled.unconvertible.length > 0,
    };
  }
  // `json` accepts any JSON, so settling would only re-encode it. A stored
  // `null` is a chosen "no value", with nothing to resolve.
  if (field.type === "json" || value === null) {
    return { value, unconvertible: false };
  }
  const coerced = coerceValue(field.type, value);
  return coerced.ok
    ? { value: coerced.value, unconvertible: false }
    : { value, unconvertible: true };
}

function isTemporalField(field: MetaBoxField): field is TemporalMetaBoxField {
  return (
    field.inputType === "date" ||
    field.inputType === "datetime" ||
    field.inputType === "time"
  );
}

// Anchored to UTC so wall-clock components survive any server/browser
// timezone pair; the inverse of `formatTemporalValue`. An unparseable value
// reads as no value, since the read type is `Date`.
function projectTemporalDate(
  inputType: TemporalInputType,
  value: unknown,
): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const parsed = new Date(anchorTemporalUtc(inputType, value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function isEmptyMetaPatch(patch: MetaPatch | null): boolean {
  return (
    patch === null || (patch.upserts.size === 0 && patch.deletes.length === 0)
  );
}

/**
 * Uses `json_set`/`json_remove` so concurrent updaters touching disjoint keys
 * don't clobber each other.
 */
export async function applyMetaPatch(
  ctx: AppContext,
  table: { meta: SQLiteColumn },
  idColumn: SQLiteColumn,
  id: number,
  patch: MetaPatch,
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;

  let expr: SQL = sql`${table.meta}`;
  if (patch.deletes.length > 0) {
    const paths = patch.deletes.map((k) => sql`${requireMetaJsonPath(k)}`);
    expr = sql`json_remove(${expr}, ${sql.join(paths, sql`, `)})`;
  }
  if (patch.upserts.size > 0) {
    const pairs = Array.from(
      patch.upserts,
      ([key, value]) =>
        sql`${requireMetaJsonPath(key)}, json(${JSON.stringify(value)})`,
    );
    expr = sql`json_set(${expr}, ${sql.join(pairs, sql`, `)})`;
  }

  await ctx.db
    // drizzle wants an `AnyTable`; the generic only pins `meta`, and the cast
    // keeps the helper reusable without widening the public types.
    .update(table as never)
    .set({ meta: expr })
    .where(eq(idColumn, id));
}

/**
 * Writes only while every moved key still holds what was read, so a save in
 * between is never overwritten. Leaves `updatedAt` alone: a settle is not an
 * edit.
 */
export async function writeSettledMeta(
  ctx: AppContext,
  table: { meta: SQLiteColumn; updatedAt?: SQLiteColumn },
  idColumn: SQLiteColumn,
  id: number,
  stored: JsonObject | null | undefined,
  patch: MetaPatch,
): Promise<boolean> {
  if (isEmptyMetaPatch(patch)) return false;
  const moved = Array.from(patch.upserts);
  const assignments = moved.map(
    ([key, value]) =>
      sql`${requireMetaJsonPath(key)}, json(${JSON.stringify(value)})`,
  );
  const unchanged = moved.map(
    ([key]) =>
      sql`json_extract(${table.meta}, ${requireMetaJsonPath(key)}) IS json_extract(${JSON.stringify(stored?.[key] ?? null)}, '$')`,
  );
  const written = await ctx.db
    // As in `applyMetaPatch`: the generic constraint pins only the columns
    // this touches, so drizzle's `AnyTable` is reached structurally.
    .update(table as never)
    .set({
      meta: sql`json_set(${table.meta}, ${sql.join(assignments, sql`, `)})`,
      // drizzle's `$onUpdate` stamps any column a `set` leaves out.
      ...(table.updatedAt ? { updatedAt: sql`${table.updatedAt}` } : {}),
    })
    .where(and(eq(idColumn, id), ...unchanged))
    .returning({ id: idColumn });
  return written.length > 0;
}

/**
 * Load + decode the full meta bag for a single row. A missing row
 * (deleted mid-flight) or one with no saved meta decodes from an empty
 * bag.
 */
export async function loadMeta(
  ctx: AppContext,
  table: { meta: SQLiteColumn },
  idColumn: SQLiteColumn,
  id: number,
  scope: MetaScope,
): Promise<ResolvedMeta> {
  const [row] = (await ctx.db
    .select({ meta: table.meta })
    .from(table as never)
    .where(eq(idColumn, id))) as { meta: unknown }[];
  return decodeMetaBag(scope, row?.meta as JsonObject | undefined);
}

// --- internals below ---------------------------------------------------

// Non-RPC callers such as hook listeners bypass the RPC schema that rejects
// `"` and `\`.
function requireMetaJsonPath(key: string): string {
  const path = metaJsonPath(key);
  if (path === null) throw MetaReferenceError.metaKeyForbiddenChars(key);
  return path;
}

function assertEncodedSize(key: string, value: unknown): void {
  const encoded = JSON.stringify(value) as string | undefined;
  if (encoded === undefined) return; // already caught in coerceJson
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > MAX_META_VALUE_BYTES) {
    throw MetaSanitizationError.valueTooLarge({ key });
  }
}
