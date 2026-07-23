import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type {
  LookupAdapter,
  ReferenceHydrationShapes,
} from "../../plugin/lookup.js";
import type {
  MetaBoxField,
  MetaScalarType,
  ReferenceTarget,
  RepeaterMetaBoxField,
  TemporalInputType,
  TemporalMetaBoxField,
} from "../../plugin/manifest.js";
import type { MetaFieldError } from "./field-pipeline.js";
import { accumulateEmbeddedTags } from "../../cache/embedded-tags.js";
import { eq } from "../../db/index.js";
import { isConditionHidden } from "../../plugin/fields/condition.js";
import { anchorTemporalUtc } from "../../plugin/manifest.js";
import { MetaReferenceError } from "./errors.js";
import { META_FIELD_MESSAGES } from "./field-messages.js";
import {
  extractStringId,
  healReferenceValue,
  isGroupField,
  isRepeaterField,
  referenceTargetOf,
  runFieldPipeline,
} from "./field-pipeline.js";

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
 * Re-canonicalize a *stored* meta bag before `entry.publish` promotes it
 * onto the live row — a permanent second gate for drafts persisted
 * before the write-time sanitizer existed, whose values never met a
 * `.sanitize()`. Runs each *registered* key through its field pipeline
 * and keeps the canonical result; passes *unregistered* keys through
 * untouched (live bags legitimately carry keys from uninstalled plugins
 * that `decodeMetaBag` preserves and `sanitizeMetaInput` would reject).
 *
 * Forgiving by design, like the read path (`decodeMetaBag`): a whole
 * autosave bag is promoted, not a caller's touched patch, so a value
 * that fails validation is schema drift or a legacy row — the live write
 * path already gated user intent, so here we keep the stored value rather
 * than abort an unrelated publish. Only `.sanitize()`'s canonical output
 * replaces a value; a deletion (`null`) drops the key. Field capabilities
 * and reference existence are likewise not re-checked: a whole-bag gate
 * would block a publisher over a co-author's field, and read-time
 * hydration already masks dangling refs.
 */
export async function sanitizeRegisteredMetaBag(
  findField: (key: string) => MetaBoxField | undefined,
  bag: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const out: MetaMap = {};
  for (const [key, value] of Object.entries(bag)) {
    const field = findField(key);
    if (!field) {
      out[key] = value;
      continue;
    }
    const result = await runFieldPipeline(field, value, key);
    if (result.isDeletion === true) continue;
    out[key] = result.errors.length > 0 ? value : result.value;
  }
  return out;
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
 * in the meta bag; `hydrateMetaBags` masks it on read. Wrap the
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
    // Composite fields (repeater / group) don't carry a
    // `referenceTarget` themselves but their rows / members can, at any
    // nesting depth. Walk them so nested `entry` / `term` / `user` /
    // `media` refs flow through the same `(kind, scope)` batch as
    // top-level fields. Errors attribute to the top-level key — the
    // dotted sub-path lives in the developer log, not the wire response.
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
            // Wire error keys on the top-level field; this log line
            // is the only place the nested sub-path surfaces, so an
            // engineer debugging a `meta_invalid_value` on a composite
            // field can locate the offending cell without bisecting the
            // saved bag. `JSON.stringify` escapes control characters so
            // a user-supplied id with newlines can't poison the log.
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

// Walk a composite field's live value, collecting + normalizing every
// nested reference in place. `path` is the dotted address of `field`
// from the top-level key (developer-log only). Recurses through nested
// repeaters and groups, so a reference at any depth flows through the
// same `(kind, scope)` batch and is orphan-checked at write time.
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
  container: Record<string, unknown>,
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
  /** The top-level key surfaced in `MetaSanitizationError`. */
  readonly errorKey: string;
  readonly ids: readonly string[];
  /**
   * Diagnostic only — set for nested (repeater row / group member)
   * contributions so server logs identify the offending cell by its
   * dotted sub-path (e.g. `sections.2.hero`). The wire error always
   * keys on the top-level field, but engineers debugging a save need to
   * know which cell.
   */
  readonly diagnostic?: {
    readonly path: string;
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

// The read-time hydration + orphan pass. `hydrateMetaBags` resolves
// reference fields across every bag in a response in one traversal:
// stored ids become the adapter's hydrated shapes (media item with
// URL, entry/term/user summaries), and any id whose target is gone or
// out of scope reads as absent — single refs `null`, multi refs
// dropped from the array (which stays dense, in order). Ids aggregate
// across all reference fields of all bags, then resolve with one
// in-query per `(kind, scope)` group regardless of entry/field count.
// Adapter `hydrate`/`list` honours `scope` (`entryTypes`,
// `termTaxonomies`, `roles`, …) so out-of-scope ids fall out of the
// result naturally and read as orphans. Callers pass freshly-decoded
// bags (from `decodeMetaBag`); returned bags are shallow copies.
// Non-reference keys pass through untouched.
/** A path segment from the bag root: object key (string) or array index (number). */
type PathSegment = string | number;

interface ReferenceOccurrence {
  /**
   * Full path from the bag root to the reference slot. `[key]` for a
   * top-level field; `[key, rowIdx, subKey, …]` for references nested
   * in repeater rows and groups at any depth. The last segment is
   * always the leaf object key.
   */
  readonly path: readonly PathSegment[];
  readonly target: ReferenceTarget;
  readonly value: unknown;
}

/**
 * Yield every reference-field occurrence in a decoded meta bag: top-level
 * reference fields, plus references nested inside repeater rows and
 * groups at any depth. One structural walk so the hydration pass doesn't
 * reinline the traversal twice.
 */
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
    yield { path, target, value };
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
 * `hydrateMetaBags` operates on. Multi-entity responses pass one per
 * entity so ids aggregate across the whole response.
 */
export interface HydratableBag {
  readonly findField: (key: string) => MetaBoxField | undefined;
  readonly decoded: MetaMap;
}

/** Single-bag convenience over {@link hydrateMetaBags}. */
export async function hydrateMetaReferences(
  ctx: AppContext,
  findField: (key: string) => MetaBoxField | undefined,
  decoded: MetaMap,
): Promise<MetaMap> {
  const [bag] = await hydrateMetaBags(ctx, [{ findField, decoded }]);
  // hydrateMetaBags returns one bag per input by construction.
  return bag ?? decoded;
}

/**
 * How a `(kind, scope)` group resolved in Pass 2: adapters with the
 * `hydrate` contract yield payloads keyed by id (values become the
 * hydrated shapes); adapters without it yield the live-id set only
 * (values stay plain ids, orphan-stripped — the pre-hydration read).
 * Either way, an id absent from the result reads as an orphan:
 * single refs null, multi refs drop the item (array stays dense).
 */
type GroupResolution =
  | { readonly kind: "hydrated"; readonly byId: ReadonlyMap<string, unknown> }
  | { readonly kind: "ids"; readonly liveIds: ReadonlySet<string> };

export async function hydrateMetaBags(
  ctx: AppContext,
  bags: readonly HydratableBag[],
): Promise<MetaMap[]> {
  // Pass 1: shallow-copy each bag into its output slot, classify each
  // reference occurrence, and accumulate ids per `(kind, scope)`
  // group. Candidates carry their bag references so Pass 3 is a
  // straight walk with no findField / registry re-lookups.
  interface Candidate {
    /** The shallow output copy of the candidate's bag. */
    readonly outBag: MetaMap;
    /** The caller's original decoded bag (for lazy copy-on-write). */
    readonly decoded: MetaMap;
    /** Full path from the bag root to the reference slot. */
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
      readonly scope: unknown;
      readonly ids: Set<string>;
    }
  >();
  // Top-level refs and nested (repeater / group) refs get identical
  // treatment, so the single `referenceOccurrences` walk feeds both.
  // Every candidate carries its full path; Pass 3 rewrites the slot in a
  // per-path copy-on-write so callers' bags stay untouched.
  const out: MetaMap[] = [];
  for (const bag of bags) {
    const outBag: MetaMap = { ...bag.decoded };
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
        group = { registered, scope: occ.target.scope, ids: new Set() };
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
            group.scope,
            group.ids,
          ),
        ],
      ),
    ),
  );

  // Pass 3: apply. Hydrated groups replace ids with their payloads;
  // id-only groups keep ids. Multi refs stay dense and in stored
  // order; single refs null on missing. Nested candidates copy-on-write
  // each container down their path so callers' bags stay untouched.
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
 * Batched, tag-accounted hydration of a raw id set for one reference kind
 * — the theme-facing counterpart to the meta pipeline's hydration (#1508).
 * A theme holding an id-only reference field (a field declared
 * `.returns("id")`, or one contributed by a third-party plugin) resolves
 * it here instead of hand-rolled per-item fetches: ids resolve through the
 * adapter's batched `hydrate` (chunked, one in-query per chunk) and every
 * resolved entity folds its cache tag into the page through the same
 * accumulator the meta pipeline uses, so the page is purged when an
 * embedded entity changes.
 *
 * Returns the hydrated payloads dense and in the requested id order — ids
 * that are gone or out of scope are dropped, mirroring multi-reference
 * field hydration. An unregistered kind, an adapter without the `hydrate`
 * contract, or an empty id set yields `[]`.
 */
export async function hydrateReferences<
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
    options.scope,
    unique,
  );
  if (resolution.kind !== "hydrated") return [];
  return ids
    .map((id) => resolution.byId.get(id))
    .filter((p): p is ReferenceHydrationShapes[K] => p !== undefined);
}

// Resolve one `(kind, scope)` group's aggregated ids. Chunked at
// `HYDRATION_QUERY_ID_LIMIT` per in-query: a response-level group can
// legitimately aggregate more ids than one query may carry (a
// 100-entry archive × multi-reference fields), and a read-path throw
// would kill the render — unlike the write-side `fetchLiveIds`, which
// keeps throwing because a single patch exceeding the ceiling is a
// caller bug. Ids are de-duped before chunking, so per-query batches
// stay bounded and nothing is truncated.
async function resolveGroup(
  ctx: AppContext,
  adapter: LookupAdapter,
  scope: unknown,
  ids: ReadonlySet<string>,
): Promise<GroupResolution> {
  const idList = [...ids];
  if (adapter.hydrate) {
    const byId = new Map<string, unknown>();
    for (const chunk of chunkIds(idList)) {
      const payloads = await adapter.hydrate(ctx, { ids: chunk, scope });
      for (const payload of payloads) {
        byId.set(payload.id, payload);
        // Fold this embedded entity's cache tag into the page's tags so
        // a change to it purges the page that hydrated it (#1508). Runs
        // on every read surface; only the public read-through reads the
        // accumulator back, so admin/REST reads populate it harmlessly.
        if (adapter.embeddedCacheTags) {
          accumulateEmbeddedTags(ctx, adapter.embeddedCacheTags(payload));
        }
      }
    }
    return { kind: "hydrated", byId };
  }
  const liveIds = new Set<string>();
  for (const chunk of chunkIds(idList)) {
    const rows = await adapter.list(ctx, {
      ids: chunk,
      scope,
      limit: chunk.length,
    });
    for (const row of rows) liveIds.add(row.id);
  }
  return { kind: "ids", liveIds };
}

// Per-query id cap for the read path. 100 (not the 1000 aggregate
// ceiling) because Cloudflare D1 caps bound parameters at 100 per
// statement and `inArray` binds one per id — a bigger chunk works on
// local SQLite and dies in production.
const HYDRATION_QUERY_ID_LIMIT = 100;

function* chunkIds(ids: readonly string[]): Generator<readonly string[]> {
  for (let i = 0; i < ids.length; i += HYDRATION_QUERY_ID_LIMIT) {
    yield ids.slice(i, i + HYDRATION_QUERY_ID_LIMIT);
  }
}

// Write one candidate's resolved value into its slot — the leaf object
// key of a container reached by walking the candidate's path.
function applyResolutionToSlot(
  slot: Record<string, unknown>,
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

// Walk the candidate's path from the output bag to the parent container
// of its leaf slot, copy-on-writing each container the first time it's
// descended so the caller's `decoded` bag stays untouched. Containers
// cloned by an earlier candidate (identity no longer matches `decoded`)
// are reused, so sibling references in the same row/group land in one
// clone. Returns the writable parent object and the leaf key, or null if
// any segment's runtime shape doesn't match the declared structure
// (hand-edited / migrated bags).
function takeWritableSlot(
  outBag: MetaMap,
  decoded: MetaMap,
  path: readonly PathSegment[],
): {
  readonly parent: Record<string, unknown>;
  readonly leafKey: string;
} | null {
  let outContainer: unknown = outBag;
  let decContainer: unknown = decoded;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (seg === undefined) return null;
    const outChild = readSegment(outContainer, seg);
    const decChild = readSegment(decContainer, seg);
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

function readSegment(container: unknown, seg: PathSegment): unknown {
  if (typeof seg === "number") {
    return Array.isArray(container) ? container[seg] : undefined;
  }
  return isPlainObject(container) ? container[seg] : undefined;
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
function cloneContainer(
  value: unknown,
): unknown[] | Record<string, unknown> | null {
  // `Array.isArray` widens to `any[]`; cast before spread so the clone
  // stays `unknown[]` rather than leaking `any` into the walk.
  if (Array.isArray(value)) return [...(value as readonly unknown[])];
  if (isPlainObject(value)) return { ...value };
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Returns `null` to mean "no candidates from this key" (skip), or
// the ids to feed into the group's batch query. Mirrors the storage-
// shape guards in the apply step so we don't enqueue work that's
// going to be skipped. Callers pass values already decoded through
// `decodeMetaBag`, so legacy object shapes have been healed to plain
// ids by the time this runs.
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
