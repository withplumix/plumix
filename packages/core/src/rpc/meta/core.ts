import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type { LookupAdapter } from "../../plugin/lookup.js";
import type {
  MetaBoxField,
  MetaScalarType,
  ReferenceTarget,
  RepeaterMetaBoxField,
  TemporalInputType,
  TemporalMetaBoxField,
} from "../../plugin/manifest.js";
import type { MetaFieldError } from "./field-pipeline.js";
import { eq } from "../../db/index.js";
import { isConditionHidden } from "../../plugin/fields/condition.js";
import { anchorTemporalUtc } from "../../plugin/manifest.js";
import { MetaReferenceError } from "./errors.js";
import { META_FIELD_MESSAGES } from "./field-messages.js";
import { isRepeaterField, runFieldPipeline } from "./field-pipeline.js";

// Shared meta plumbing for every entity that stores a `meta` JSON
// column (entries, terms, and — eventually — users). The storage
// contract: writes merge into the bag via SQLite `json_set` /
// `json_remove`; reads come back already-parsed via drizzle's
// `mode: "json"`. Per-entity specializations in `procedures/{entry,
// term}/meta.ts` thread the right table + action name through these
// helpers.

/** Per-value byte cap after JSON encoding. 256 KiB fits any realistic
 *  plugin config while bounding adversarial payloads. */
const MAX_META_VALUE_BYTES = 256 * 1024;

type MetaMap = Record<string, unknown>;

/**
 * Validated meta patch produced by `sanitizeMetaInput`. Values in
 * `upserts` are the *decoded* post-sanitization objects — filter hooks
 * see this shape, so keeping decoded values here means a plugin
 * doesn't have to double-parse. `applyMetaPatch` JSON-encodes at the
 * last moment, before the UPDATE.
 *
 * `upserts` is mutable: `validateMetaReferences` normalizes reference
 * values to the plain-id storage form (a legacy `{ id, ... }` object
 * self-heals to its id). Other callers should treat it as read-only.
 */
export interface MetaPatch {
  readonly upserts: Map<string, unknown>;
  readonly deletes: readonly string[];
}

/**
 * Reason codes are part of the RPC error `data.reason` surface — admin
 * UIs and plugin tests match on these strings, so treat them as a
 * public contract.
 */
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
 * Minimum shape of the oRPC `errors` object needed to surface a
 * `MetaSanitizationError` as a CONFLICT. Declared structurally so this
 * helper doesn't have to import oRPC types — the handler passes its
 * `errors` in and TS matches on shape.
 */
interface RpcErrorsForMeta {
  CONFLICT: (args: {
    data: {
      reason: string;
      key?: string;
      errors?: MetaFieldError[];
    };
  }) => Error;
}

/**
 * Standard payload for `<entity>:meta_changed` actions. `set` is the
 * decoded key → value map of upserts; `removed` is the list of
 * cleared keys.
 */
export interface MetaChanges {
  readonly set: Readonly<Record<string, unknown>>;
  readonly removed: readonly string[];
}

/**
 * The whole-patch rejection produced by `sanitizeMetaInput` when any
 * field's pipeline reports errors: every `{ path, message }` across
 * every key of the request, so the admin form can address each
 * offending input in one round-trip. Nothing is written when this
 * throws.
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
 * Validate an incoming meta map against a field-lookup fn produced by
 * the caller (entry vs term differ only in which registry they walk).
 * `null` / `undefined` values are deletion requests; everything else
 * runs the per-field pipeline (coercion → `.sanitize()` → declarative
 * constraints → `.validate()`). Pipeline rejections aggregate across
 * the whole patch into one `MetaValidationError`; unregistered keys
 * and oversized values keep the legacy fail-fast
 * `MetaSanitizationError` surface.
 */
export async function sanitizeMetaInput(
  findField: (key: string) => MetaBoxField | undefined,
  input: MetaMap | undefined,
): Promise<MetaPatch | null> {
  if (input === undefined) return null;
  const upserts = new Map<string, unknown>();
  const deletes: string[] = [];
  const fieldErrors: MetaFieldError[] = [];
  for (const [key, rawValue] of Object.entries(input)) {
    const field = findField(key);
    if (!field) {
      throw MetaSanitizationError.notRegistered({ key });
    }
    if (isConditionHidden(field, input)) continue;
    const result = await runFieldPipeline(field, rawValue, key);
    if (result.errors.length > 0) {
      fieldErrors.push(...result.errors);
      continue;
    }
    if (result.isDeletion === true) {
      deletes.push(key);
      continue;
    }
    assertEncodedSize(key, result.value);
    upserts.set(key, result.value);
  }
  if (fieldErrors.length > 0) {
    throw new MetaValidationError(fieldErrors);
  }
  return { upserts, deletes };
}

/**
 * Thin wrapper that translates thrown meta errors into the RPC
 * handler's CONFLICT envelope. Pipeline rejections ship their
 * `{ path, message }` list under `data.errors` (with `key` pointing
 * at the first error's top-level field for legacy consumers); the
 * fail-fast `MetaSanitizationError` reasons keep their existing
 * `data.reason`/`data.key` shape.
 */
export async function sanitizeMetaForRpc(
  findField: (key: string) => MetaBoxField | undefined,
  input: MetaMap | undefined,
  errors: RpcErrorsForMeta,
): Promise<MetaPatch | null> {
  try {
    return await sanitizeMetaInput(findField, input);
  } catch (error) {
    if (error instanceof MetaValidationError) {
      throw errors.CONFLICT({
        data: {
          reason: "meta_invalid_value",
          key: error.errors[0]?.path.split(".")[0],
          errors: [...error.errors],
        },
      });
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
 * Walk a sanitized patch, group every reference upsert by
 * `(kind, scope)`, and issue one `LookupAdapter.list({ ids })`
 * query per group to confirm all upserted IDs are real and in
 * scope **at validation time**. Throws `invalid_value` for any id
 * missing from its group's live-id set — same surface whether the
 * adapter is unregistered, the target is gone, or scope rejected
 * it. Sync `sanitize` callbacks can't run DB queries, so this is a
 * separate async step the RPC procedures invoke between
 * sanitisation and `applyMetaPatch`.
 *
 * TOCTOU note: validate runs in a separate query from the eventual
 * `applyMetaPatch`, and callers don't share a transaction. A
 * concurrent delete between validate and apply leaves an orphan id
 * in the meta bag; `filterMetaOrphans` masks it on read. Wrap the
 * validate/apply pair in `ctx.db.transaction()` if a caller needs
 * serializable consistency.
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
      // Normalize eagerly — a validation failure below aborts the whole
      // save, so a rewritten patch never persists on the failure path.
      patch.upserts.set(key, target.multiple ? ids : ids[0]);
      const group = upsertGroup(groups, target, registered);
      for (const id of ids) group.ids.add(id);
      group.contributions.push({ errorKey: key, ids });
      continue;
    }
    // Repeater fields don't carry a `referenceTarget` themselves but
    // their rows can. Walk into rows so nested `entry` / `term` /
    // `user` / `media` refs flow through the same `(kind, scope)`
    // batch as top-level fields. Errors attribute to the top-level
    // repeater key — the row index + subKey live in the developer
    // log, not the wire response (per slice acceptance).
    if (!isRepeaterField(field)) continue;
    if (!Array.isArray(value)) continue;
    collectRepeaterReferences(ctx, key, field, value, groups);
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
            // Wire error keys on the top-level field; this log line
            // is the only place the row index + subKey surface, so
            // an engineer debugging a `meta_invalid_value` on a
            // repeater can locate the offending subField without
            // bisecting the saved bag. `JSON.stringify(id)` escapes
            // control characters so a user-supplied id with newlines
            // can't poison the log stream.
            console.error(
              `[plumix] meta repeater ${JSON.stringify(contribution.errorKey)} ` +
                `row ${String(contribution.diagnostic.rowIdx)} ` +
                `subField ${JSON.stringify(contribution.diagnostic.subKey)} ` +
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

function collectRepeaterReferences(
  ctx: AppContext,
  topKey: string,
  field: RepeaterMetaBoxField,
  rows: readonly unknown[],
  groups: Map<string, ReferenceGroup>,
): void {
  // Nested repeaters are rejected at registration by `repeater()`, so
  // any subField that's itself a repeater wouldn't get here in
  // practice. We don't recurse into subField repeaters either way —
  // single-source-of-truth on the registration guard.
  for (const [rowIdx, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rowObj = row as Record<string, unknown>;
    for (const subField of field.subFields) {
      const target = referenceTargetOf(subField);
      if (!target) continue;
      const subValue = rowObj[subField.key];
      if (subValue === undefined || subValue === null) continue;
      const registered = ctx.plugins.lookupAdapters.get(target.kind);
      if (!registered) {
        throw MetaSanitizationError.invalidValue({ key: topKey });
      }
      const ids = referenceIdsForValidation(
        topKey,
        subValue,
        target,
        fieldMax(subField),
      );
      // Normalize the row's slot in place — the top-level upsert array
      // is the live storage shape, so mutating an object inside it is
      // what the caller will serialize.
      rowObj[subField.key] = target.multiple ? ids : ids[0];
      const group = upsertGroup(groups, target, registered);
      for (const id of ids) group.ids.add(id);
      group.contributions.push({
        errorKey: topKey,
        ids,
        diagnostic: { rowIdx, subKey: subField.key },
      });
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
  /** The top-level key surfaced in `MetaSanitizationError`. */
  readonly errorKey: string;
  readonly ids: readonly string[];
  /**
   * Diagnostic only — set for nested-in-repeater contributions so
   * server logs identify the offending row/subField. The wire error
   * always keys on the top-level field per slice acceptance, but
   * engineers debugging a save need to know which row.
   */
  readonly diagnostic?: {
    readonly rowIdx: number;
    readonly subKey: string;
  };
}

// Defense-in-depth ceiling on the internal-aggregated id-batch size.
// Above this, the live-id fetch throws rather than silently truncating.
// The wire cap (100) and per-field cap (`HARD_MULTI_REFERENCE_LIMIT`,
// 100) keep external + per-field batches small; this ceiling only
// kicks in if many fields share `(kind, scope)` and aggregate.
const MAX_REFERENCE_GROUP_BATCH = 1000;

// Same kind + same scope = same SQL filter, so they batch into one
// `list({ ids })` call. JSON.stringify is good enough for the scope
// shapes we ship (`UserFieldScope`, `EntryFieldScope`,
// `TermFieldScope` are all simple objects with stable key order at
// build time). Plugin authors who construct scopes with non-stable
// key order get separate groups — extra query, no correctness issue.
//
// `::` separator is collision-safe by construction: `kind` is
// constrained to `[a-z][a-z0-9_-]{0,63}` (no colons) by the lookup
// RPC schema, and core registers `user`/`entry`/`term` directly.
//
// `LookupAdapter` requires JSON-serializable scope; rethrow with a
// clear message if `JSON.stringify` rejects (BigInt, cycle, function)
// rather than letting the downstream read crash with a generic.
function referenceGroupKey(target: ReferenceTarget): string {
  try {
    return `${target.kind}::${JSON.stringify(target.scope ?? null)}`;
  } catch (cause) {
    throw MetaReferenceError.scopeNotSerializable(target.kind, cause);
  }
}

// Run one `list({ ids })` per group, throwing if the aggregated batch
// blew past `MAX_REFERENCE_GROUP_BATCH`. The wire schema caps `ids` at
// 100 per-request and `HARD_MULTI_REFERENCE_LIMIT` caps each field at
// 100, so we only hit the ceiling when many fields share `(kind, scope)`
// and aggregate — at which point throwing beats silent truncation
// (truncation would either reject valid writes or hide live targets).
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

// Defensive upper bound on multi-reference array length, applied
// per-field before grouping. Even with the batched `list({ ids })`
// path, an unbounded array still pulls 10k rows in one query — the
// cap protects the wire / response size. 100 covers any realistic
// multi-reference field (authors, tags, related entries); fields
// can declare a lower `max` and the validator picks the smaller.
const HARD_MULTI_REFERENCE_LIMIT = 100;

// Validates the wire shape of a reference value and returns the ids
// to feed into the group's batched `list({ ids })` call. Storage is
// plain ids — a bare string (single) or string[] (multi) — but each
// slot leniently accepts the retired cached-object shape
// (`{ id, ... }`) so legacy values self-heal to the plain form on
// the entity's next save.
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

// Returns the `id` string of a `{ id: string, ... }` object, or null
// for any other shape (string, array, null, primitive, missing key).
function extractStringId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const id = (value as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : null;
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
  errors: RpcErrorsForMeta,
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

/**
 * Resolve reference fields in a decoded meta bag, dropping any
 * stored ID whose target is gone (or no longer matches scope).
 * Single-reference orphans become `null`; multi-reference orphans
 * are removed from the array (which stays dense, in order). Caller
 * passes a freshly-decoded bag (e.g. from `decodeMetaBag`); the
 * returned bag is a shallow copy with orphans handled. Non-reference
 * keys pass through untouched.
 *
 * Two-pass: first walk groups every reference key by `(kind, scope)`
 * and issues one `LookupAdapter.list({ ids })` per group; second
 * walk applies the live-id sets. So a meta bag with five user-refs,
 * three entry-refs, and two term-refs costs three queries total —
 * not ten. Adapter `list` honours `scope` (`entryTypes`,
 * `termTaxonomies`, `roles`, …) so out-of-scope ids fall out of the
 * result naturally and read as orphans.
 */
interface ReferenceOccurrence {
  /** Top-level meta key — the storage location and error key. */
  readonly key: string;
  readonly target: ReferenceTarget;
  readonly value: unknown;
  /** Set when the reference is a subField inside a repeater row. */
  readonly nested?: {
    readonly rowIdx: number;
    readonly subKey: string;
  };
}

/**
 * Yield every reference-field occurrence in a decoded meta bag: top-level
 * reference fields, plus reference subFields inside each repeater row. One
 * structural walk so the orphan-strip pass doesn't reinline the
 * top-level/repeater traversal twice.
 */
function* referenceOccurrences(
  entries: Iterable<readonly [string, unknown]>,
  findField: (key: string) => MetaBoxField | undefined,
): Generator<ReferenceOccurrence> {
  for (const [key, value] of entries) {
    const field = findField(key);
    const target = referenceTargetOf(field);
    if (target) {
      yield { key, target, value };
      continue;
    }
    if (!isRepeaterField(field)) continue;
    if (!Array.isArray(value)) continue;
    for (const [rowIdx, row] of value.entries()) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const rowObj = row as Record<string, unknown>;
      for (const subField of field.subFields) {
        const subTarget = referenceTargetOf(subField);
        if (!subTarget) continue;
        yield {
          key,
          target: subTarget,
          value: rowObj[subField.key],
          nested: { rowIdx, subKey: subField.key },
        };
      }
    }
  }
}

export async function filterMetaOrphans(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  decoded: MetaMap,
): Promise<MetaMap> {
  // Pass 1: classify each reference key, cache the per-key triple, and
  // accumulate ids per `(kind, scope)` group. Pass 3 walks the cache
  // directly so it doesn't redo the findField / registry lookups.
  interface Candidate {
    /** Top-level meta key — the storage location for top-level refs. */
    readonly key: string;
    readonly multiple: boolean;
    readonly groupKey: string;
    readonly ids: readonly string[];
    /** When set, the candidate is a reference subField inside a repeater row. */
    readonly nested?: {
      readonly rowIdx: number;
      readonly subKey: string;
    };
  }
  const candidates: Candidate[] = [];
  const groups = new Map<
    string,
    {
      readonly registered: { readonly adapter: LookupAdapter };
      readonly scope: unknown;
      readonly ids: Set<string>;
    }
  >();
  // Top-level refs and repeater-row subField refs get identical orphan-strip
  // treatment, so the single `referenceOccurrences` walk feeds both. Nested
  // candidates carry their `rowIdx`/`subKey`; Pass 3 rewrites the row slot in
  // a per-key clone so the caller's `decoded` bag stays untouched.
  for (const occ of referenceOccurrences(Object.entries(decoded), findField)) {
    const registered = ctx.plugins.lookupAdapters.get(occ.target.kind);
    if (!registered) continue;
    const ids = orphanCandidateIds(occ.target, occ.value);
    if (ids === null) continue; // non-array multi / non-string single — leave untouched
    const groupKey = referenceGroupKey(occ.target);
    candidates.push({
      key: occ.key,
      multiple: occ.target.multiple === true,
      groupKey,
      ids,
      nested: occ.nested,
    });
    if (ids.length === 0) continue;
    let group = groups.get(groupKey);
    if (!group) {
      group = { registered, scope: occ.target.scope, ids: new Set() };
      groups.set(groupKey, group);
    }
    for (const id of ids) group.ids.add(id);
  }

  // Pass 2: one `list({ ids })` per group, keyed for O(1) apply lookup.
  const liveIdsByGroup = new Map<string, ReadonlySet<string>>();
  for (const [groupKey, group] of groups) {
    const liveIds = await fetchLiveIds(
      ctx,
      group.registered,
      group.scope,
      group.ids,
      "filterMetaOrphans",
    );
    liveIdsByGroup.set(groupKey, liveIds);
  }

  // Pass 3: apply the filter. Multi refs filter the string[] dense
  // and in order; single refs null on missing. Nested-in-repeater
  // candidates rewrite the row's subField slot in a per-key cloned
  // array so the input bag stays untouched.
  const out: MetaMap = { ...decoded };
  const empty: ReadonlySet<string> = new Set();
  for (const candidate of candidates) {
    const { key, multiple, groupKey, ids, nested } = candidate;
    const liveIds = liveIdsByGroup.get(groupKey) ?? empty;
    if (nested !== undefined) {
      const rowObj = takeWritableRow(out, decoded, key, nested.rowIdx);
      if (!rowObj) continue;
      applyOrphanToSlot(rowObj, nested.subKey, multiple, ids, liveIds);
      continue;
    }
    if (multiple) {
      out[key] = ids.filter((id) => liveIds.has(id));
      continue;
    }
    const [singleId] = ids;
    if (singleId === undefined) continue; // single non-string already filtered upstream
    if (!liveIds.has(singleId)) out[key] = null;
  }
  return out;
}

function takeWritableRow(
  out: MetaMap,
  decoded: MetaMap,
  key: string,
  rowIdx: number,
): Record<string, unknown> | null {
  // Lazily clone the rows array (and the targeted row inside it) on
  // first nested write so the caller's `decoded` bag stays untouched.
  // Subsequent nested writes hit the same cloned array.
  let arr: unknown = out[key];
  if (arr === decoded[key]) {
    if (!Array.isArray(arr)) return null;
    const cloned: unknown[] = arr.map((row: unknown) =>
      row && typeof row === "object" && !Array.isArray(row)
        ? { ...(row as Record<string, unknown>) }
        : row,
    );
    out[key] = cloned;
    arr = cloned;
  }
  if (!Array.isArray(arr)) return null;
  const row: unknown = arr[rowIdx];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  return row as Record<string, unknown>;
}

function applyOrphanToSlot(
  rowObj: Record<string, unknown>,
  subKey: string,
  multiple: boolean,
  ids: readonly string[],
  liveIds: ReadonlySet<string>,
): void {
  if (multiple) {
    rowObj[subKey] = ids.filter((id) => liveIds.has(id));
    return;
  }
  const [singleId] = ids;
  if (singleId === undefined) return;
  if (!liveIds.has(singleId)) rowObj[subKey] = null;
}

// Returns `null` to mean "no candidates from this key" (skip), or
// the ids to feed into the group's batch query. Mirrors the storage-
// shape guards in the apply step so we don't enqueue work that's
// going to be skipped. Callers pass values already decoded through
// `decodeMetaBag`, so legacy object shapes have been healed to plain
// ids by the time this runs.
function orphanCandidateIds(
  target: ReferenceTarget,
  value: unknown,
): readonly string[] | null {
  if (target.multiple) {
    if (!Array.isArray(value)) return null;
    return value.filter((id): id is string => typeof id === "string");
  }
  return typeof value === "string" ? [value] : null;
}

function referenceTargetOf(
  field: MetaBoxField | undefined,
): ReferenceTarget | undefined {
  if (!field) return undefined;
  return (field as { readonly referenceTarget?: ReferenceTarget })
    .referenceTarget;
}

/**
 * Decode a raw meta bag (as returned by drizzle's JSON-mode column)
 * into the plugin-typed shape RPC consumers expect. Unregistered keys
 * pass through untouched — the row exists in the DB but the plugin
 * that wrote it is no longer installed; we don't pretend to know its
 * shape.
 */
export function decodeMetaBag(
  findField: (key: string) => MetaBoxField | undefined,
  raw: Readonly<Record<string, unknown>> | null | undefined,
): MetaMap {
  if (!raw) return {};
  const out: MetaMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = findField(key);
    out[key] = field ? decodeFieldValue(field, value) : value;
  }
  return out;
}

// Reference storage is plain ids, but bags written before the
// write-time snapshot machinery was removed may hold `{ id, ... }`
// objects. Reads yield the id; the next save persists the plain form
// (`referenceItemId` accepts the legacy shape on write).
function decodeFieldValue(field: MetaBoxField, value: unknown): unknown {
  const target = referenceTargetOf(field);
  if (target) return healReferenceValue(target, value);
  if (isRepeaterField(field) && Array.isArray(value)) {
    return value.map((row) => healRepeaterRow(field, row));
  }
  if (isTemporalField(field) && field.returns === "date") {
    return projectTemporalDate(field.inputType, value);
  }
  return coerceOnRead(field.type, value);
}

function isTemporalField(field: MetaBoxField): field is TemporalMetaBoxField {
  return (
    field.inputType === "date" ||
    field.inputType === "datetime" ||
    field.inputType === "time"
  );
}

// `.returns("date")` decode projection. All three variants anchor to
// UTC — `date` at UTC midnight, `time` on 1970-01-01 UTC — so the
// wall-clock components survive every server/browser timezone
// combination (decode runs server-side, often UTC on Workers, while
// the admin formats in the viewer's browser). Consumers read the
// parts back with `getUTC*` or `timeZone: "UTC"` formatting; the
// projection is the exact inverse of the write-side `Date` encoding
// (`formatTemporalValue`). Unparseable stored values round to "no
// value", matching the forgiving-read posture of `coerceOnRead`.
function projectTemporalDate(
  inputType: TemporalInputType,
  value: unknown,
): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const parsed = new Date(anchorTemporalUtc(inputType, value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function healReferenceValue(target: ReferenceTarget, value: unknown): unknown {
  if (target.multiple) {
    if (!Array.isArray(value)) return value;
    // Identity-preserving on the already-plain path — `healRepeaterRow`
    // clones a row only when the healed slot differs.
    if (!value.some((item: unknown) => extractStringId(item) !== null)) {
      return value;
    }
    return value.map((item: unknown) => extractStringId(item) ?? item);
  }
  return extractStringId(value) ?? value;
}

function healRepeaterRow(field: RepeaterMetaBoxField, row: unknown): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const rowObj = row as Record<string, unknown>;
  let healed: Record<string, unknown> | null = null;
  for (const subField of field.subFields) {
    const target = referenceTargetOf(subField);
    if (!target) continue;
    const value = rowObj[subField.key];
    const next = healReferenceValue(target, value);
    if (next !== value) {
      healed ??= { ...rowObj };
      healed[subField.key] = next;
    }
  }
  return healed ?? row;
}

export function isEmptyMetaPatch(patch: MetaPatch | null): boolean {
  return (
    patch === null || (patch.upserts.size === 0 && patch.deletes.length === 0)
  );
}

/**
 * Merge a validated patch into the given `meta` JSON column for the
 * row identified by `idColumn = id`. Uses SQLite `json_set` /
 * `json_remove` so concurrent updaters touching disjoint keys don't
 * clobber each other at the row level. Deletes nest inside sets so a
 * caller clearing + re-setting the same key in one request behaves
 * predictably.
 */
export async function applyMetaPatch<TTable extends { meta: SQLiteColumn }>(
  ctx: AppContext,
  table: TTable,
  idColumn: SQLiteColumn,
  id: number,
  patch: MetaPatch,
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;

  let expr: SQL = sql`${table.meta}`;
  if (patch.deletes.length > 0) {
    const paths = patch.deletes.map((k) => sql`${metaJsonPath(k)}`);
    expr = sql`json_remove(${expr}, ${sql.join(paths, sql`, `)})`;
  }
  if (patch.upserts.size > 0) {
    const pairs = Array.from(
      patch.upserts,
      ([key, value]) =>
        sql`${metaJsonPath(key)}, json(${JSON.stringify(value)})`,
    );
    expr = sql`json_set(${expr}, ${sql.join(pairs, sql`, `)})`;
  }

  await ctx.db
    // drizzle's `update(table)` wants an `AnyTable` shape; our generic
    // constraint only pins `meta`, so the update helper accepts any
    // sqlite table via structural matching. Cast keeps the helper
    // reusable across tables without widening the public types.
    .update(table as never)
    .set({ meta: expr })
    .where(eq(idColumn, id));
}

/**
 * Load + decode the full meta bag for a single row. Returns empty
 * when the row is missing (deleted mid-flight) or has no saved meta.
 */
export async function loadMeta<TTable extends { meta: SQLiteColumn }>(
  ctx: AppContext,
  table: TTable,
  idColumn: SQLiteColumn,
  id: number,
  findField: (key: string) => MetaBoxField | undefined,
): Promise<MetaMap> {
  const [row] = (await ctx.db
    .select({ meta: table.meta })
    .from(table as never)
    .where(eq(idColumn, id))) as { meta: unknown }[];
  return decodeMetaBag(findField, row?.meta as MetaMap | undefined);
}

// --- internals below ---------------------------------------------------

function assertEncodedSize(key: string, value: unknown): void {
  const encoded = JSON.stringify(value) as string | undefined;
  if (encoded === undefined) return; // already caught in coerceJson
  const byteLength = new TextEncoder().encode(encoded).length;
  if (byteLength > MAX_META_VALUE_BYTES) {
    throw MetaSanitizationError.valueTooLarge({ key });
  }
}

// Mirror the write-side accepted tokens instead of `Boolean(value)` — the
// latter would flip `"false"` → `true`, silently inverting rows persisted
// via `type: "json"` before a plugin tightened the field to `boolean`.
const TRUTHY_BOOLEAN_TOKENS: ReadonlySet<unknown> = new Set([1, "1", "true"]);
const FALSY_BOOLEAN_TOKENS: ReadonlySet<unknown> = new Set([0, "0", "false"]);

function coerceBooleanOnRead(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (TRUTHY_BOOLEAN_TOKENS.has(value)) return true;
  if (FALSY_BOOLEAN_TOKENS.has(value)) return false;
  return value;
}

function coerceOnRead(type: MetaScalarType, value: unknown): unknown {
  // Reads are forgiving — the row was validated on write but a
  // schema change (e.g. a plugin flipping `number` → `string`)
  // shouldn't 500 the editor. We coerce when we can and fall through
  // to the raw value otherwise.
  switch (type) {
    case "string":
      return typeof value === "string" ? value : String(value);
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "boolean":
      return coerceBooleanOnRead(value);
    case "json":
      return value;
  }
}

// SQLite's JSON path `$.label` only accepts `[A-Za-z0-9_]` in unquoted
// labels, but valid meta keys may include `-` or `:` (see the input
// schema regex). The double-quoted label form `$."foo-bar"` handles
// them; the RPC input schema already rejects `"` and `\`, but belt-and-
// braces matters here because non-RPC callers (tests, hook listeners,
// future surfaces) could bypass that schema and trigger SQL injection
// via a crafted path.
function metaJsonPath(key: string): string {
  if (/["\\]/.test(key)) {
    throw MetaReferenceError.metaKeyForbiddenChars(key);
  }
  return `$."${key}"`;
}
