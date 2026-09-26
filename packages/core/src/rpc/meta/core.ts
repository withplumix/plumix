import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import type { AppContext } from "../../context/app.js";
import type { JsonObject, JsonValue } from "../../json.js";
import type { MetaFieldValues } from "../../plugin/fields/condition.js";
import type {
  HydratedReference,
  LookupAdapter,
  ReferenceHydrationShapes,
} from "../../plugin/lookup.js";
import type {
  MetaBoxField,
  ReferenceTarget,
  TemporalInputType,
  TemporalMetaBoxField,
} from "../../plugin/manifest.js";
import type { ConflictErrors } from "../errors.js";
import type { FieldPipelineMode, MetaFieldError } from "./field-pipeline.js";
import { accumulateEmbeddedTags } from "../../cdn/embedded-tags.js";
import { memoBatch } from "../../context/memo.js";
import { and, chunkForD1, eq } from "../../db/index.js";
import { metaJsonPath } from "../../db/meta-path.js";
import { isJsonArray, isJsonObject } from "../../json.js";
import {
  conditionReadsAny,
  isConditionHidden,
  isFieldVisible,
  structurallyEqual,
} from "../../plugin/fields/condition.js";
import { anchorTemporalUtc } from "../../plugin/manifest.js";
import { coerceValue, extractStringId } from "./coerce.js";
import { MetaReferenceError } from "./errors.js";
import { META_FIELD_MESSAGES } from "./field-messages.js";
import {
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

/**
 * A meta bag on the read side. Not JSON: `decodeMetaBag` hands a
 * `.returns("date")` field back as a `Date`, and `resolveMetaBags` hydrates a
 * reference's stored id into whatever its lookup adapter returns, so the bag
 * stays open. The stored counterpart is {@link StoredMeta}.
 */
export type ResolvedMeta = Record<string, unknown>;

/**
 * A meta bag on the stored side — the `meta` JSON column as the row holds it.
 * Not JSON: the values are, but a targeted rule replaces this property with
 * `StoredMetaOf`, which is not. That fold types a field the author did not
 * mark `.required()` as `T | undefined`, and a `json()` or `richtext()` field
 * as `unknown` — neither has an arm in `JsonValue`, so it cannot narrow a
 * `JsonObject`. Open here is what buys the typed read there, as
 * {@link ResolvedMeta} does for `meta`.
 */
export type StoredMeta = Record<string, unknown>;

/**
 * Meta as a caller sends it: object-shaped and nothing more. Not JSON — not
 * yet: values stay unproven until the field pipeline normalizes them, and it
 * is that pass which turns the bag into the stored `JsonObject`.
 */
export type MetaInput = Readonly<Record<string, unknown>>;

/**
 * A row as a read surface hands it back: the stored row with `meta` replaced
 * by its {@link ResolvedMeta} counterpart.
 */
export type WithResolvedMeta<T> = Omit<T, "meta"> & {
  readonly meta: ResolvedMeta;
};

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
  readonly upserts: Map<string, JsonValue>;
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
 * Standard payload for `<entity>:meta_changed` actions. `set` is the
 * decoded key → value map of upserts; `removed` is the list of
 * cleared keys.
 */
export interface MetaChanges {
  readonly set: JsonObject;
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
      // A delete request (null/undefined) for a key the field system doesn't
      // own is a harmless no-op — never fail the whole write over an untracked
      // foreign key (e.g. one written by another plugin). Unknown *upserts*
      // still reject so junk can't enter through this gate.
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
    // A `.sanitize()` callback returning `undefined` leaves nothing to write.
    // The pre-#1817 path bound that `undefined` into the `json_set` update,
    // which the driver rejects — skipping the key is that write minus the
    // crash.
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
 * Where a patch lands and who is writing it. A condition cannot be judged from
 * a patch alone — a driver it omits is whatever the stored meta holds, or its
 * default when nothing is stored — and `auth` limits which of those fields the
 * author can be held to.
 */
export interface MetaPatchTarget {
  readonly stored: JsonObject;
  readonly fields: readonly MetaBoxField[];
  readonly auth: { can(capability: string): boolean };
}

/**
 * A bag as conditions see it: each declared default stands in for a key the bag
 * lacks. The decoded read and the editor's form both apply defaults, and
 * storage never holds them, so judging a condition against storage alone would
 * disagree with what the editor shows.
 * Defaults stay in their stored shape, which is what condition comparands use.
 */
export function withDeclaredDefaults(
  fields: readonly MetaBoxField[],
  bag: MetaFieldValues,
): MetaFieldValues {
  const next: Record<string, unknown> = { ...bag };
  for (const field of fields) {
    if (field.default === undefined || Object.hasOwn(next, field.key)) continue;
    next[field.key] = field.default;
  }
  return next;
}

// The stored meta with the patch laid over it, as conditions will see it; a null
// or undefined value is a deletion.
function overlayMetaPatch(
  target: MetaPatchTarget,
  input: MetaInput,
): MetaFieldValues {
  const next: Record<string, unknown> = { ...target.stored };
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return withDeclaredDefaults(target.fields, next);
}

/**
 * The patch as storage will hold it, for judging conditions. Input arrives raw
 * (a number input posts `"10"`, a date input a `Date`), but the row and so the
 * publish gate hold the settled value; a condition judged on the raw form would
 * disagree with the gate. Settled leniently: a key that fails stays raw, and
 * the real pass reports it.
 */
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

/**
 * The patched keys whose fields are hidden once the patch lands — and so are
 * dropped. A dropped write cannot hide anything else: judged against the patch
 * as sent, a hidden driver's discarded value could hide a field that is visible
 * under what actually gets stored, and that field's write would vanish without
 * an error. So the hidden set is settled to a fixpoint, with each round laying
 * only the surviving writes over the row. A chain settles within one round per
 * key; a set that has not settled by then never will.
 */
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
  // Never settled: the conditions form a cycle — an either/or pair each hiding
  // the other — so no choice of dropped writes agrees with the row it leaves.
  // Drop nothing; every write then answers to the full pipeline instead of
  // vanishing without an error.
  return new Set();
}

/**
 * A strict edit validates only its own keys, so a co-author's older drift on
 * some other field cannot block it. That covers drift the edit finds, not drift
 * it makes: changing a driver can switch another field visible, and a field it
 * switches on without supplying is this edit's to fix. Only a driver whose value
 * actually changes counts — re-sending the value it already holds makes nothing
 * newly visible.
 */
async function validateConditionDependents(
  target: MetaPatchTarget,
  input: MetaInput,
  outcome: MetaPatch,
): Promise<MetaFieldError[]> {
  // Judged by what the edit stores, not by what it sent: a write to a hidden
  // field is dropped, so it switches nothing on. Each key is compared as it
  // reads before and after, defaults included — a driver never stored already
  // reads as its default, so sending that value switches nothing on either.
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
    // Visibility reads defaults, as a read does; the value is judged as stored,
    // as the publish gate judges it — a default is shown, never saved.
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
 * Thin wrapper that translates thrown meta errors into the RPC
 * handler's CONFLICT envelope. Pipeline rejections ship their
 * `{ path, message }` list under `data.errors` (with `key` pointing
 * at the first error's top-level field for legacy consumers); the
 * fail-fast `MetaSanitizationError` reasons keep their existing
 * `data.reason`/`data.key` shape.
 */
/**
 * Map a whole-patch meta validation failure onto the RPC `CONFLICT`
 * envelope — one place so the wire shape (`key` at the first error's
 * top-level field, the full `errors` list) can't drift between the write
 * path and the publish gate.
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
 * Strict publish gate: validate a whole *stored* meta bag against the full
 * field list before `entry.publish` promotes it onto the live row. Draft
 * autosaves are lenient (business rules skipped so work-in-progress always
 * saves), so publish is where required fields, bounds, formats, option
 * membership, and row counts are finally enforced. It walks the field
 * *definitions*, not just the bag, so a required field ABSENT from the bag
 * is caught as well as one stored empty — `runFieldPipeline` sees
 * `undefined` and rejects it in strict mode.
 *
 * Rejections aggregate across the bag into one `MetaValidationError` the
 * RPC layer maps onto the admin inputs, blocking the publish. A conditionally-
 * hidden field can't be required, so it's skipped; keys the field system
 * doesn't own (e.g. from an uninstalled plugin) pass through untouched,
 * matching the read path. Field capabilities and reference existence are not
 * re-checked here — a whole-bag gate would block a publisher over a co-author's
 * field, and both were already enforced at write time.
 *
 * `touched` names the keys the author actually submitted, and only those come
 * back re-run through `.sanitize()`. Everything else is validated and returned
 * as stored: the pipeline decodes input, and the rest of the bag is not input
 * (ADR 0003). Pass every key the caller is promoting to get the whole bag
 * settled.
 *
 * `scope` is every field of the box, not just the `fields` the caller can
 * write: a driver the publisher may not edit still decides what is visible.
 */
export async function validateAndPromoteMetaBag(
  fields: readonly MetaBoxField[],
  bag: JsonObject,
  touched: ReadonlySet<string>,
  scope: readonly MetaBoxField[] = fields,
): Promise<JsonObject> {
  const shown = withDeclaredDefaults(scope, bag);
  const out: Record<string, JsonValue> = {};
  const owned = new Set<string>();
  const fieldErrors: MetaFieldError[] = [];
  for (const field of fields) {
    owned.add(field.key);
    // A hidden field is inactive, so it can't be required — but its stored
    // value is kept untouched (not validated, not dropped), or the value a
    // driver hides would be lost on publish and gone when the driver flips
    // back. Judged against `shown`, not the raw bag: a driver storage lacks
    // reads as its default, as it does in the editor.
    if (!isFieldVisible(field, shown)) {
      const stored = bag[field.key];
      if (stored !== undefined) out[field.key] = stored;
      continue;
    }
    const result = await runFieldPipeline(field, bag[field.key], field.key);
    if (result.errors.length > 0) {
      fieldErrors.push(...result.errors);
      continue;
    }
    // Validated above, so skipping the rewrite here costs the publish gate no
    // coverage. What it skips is a decode: the pipeline reads *input*, and a
    // key the author never sent is not input (ADR 0003).
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
 * in the meta bag; `resolveMetaBags` masks it on read. Wrap the
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
      // save, so a rewritten patch never persists on the failure path. A
      // single-target ref always yields exactly one id (the id extractor
      // throws rather than returning none), so the guard only narrows the
      // index access.
      const normalized = target.multiple ? ids : ids[0];
      if (normalized !== undefined) patch.upserts.set(key, normalized);
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
export function referenceGroupKey(target: ReferenceTarget): string {
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

// The read-time resolution + orphan pass. `resolveMetaBags` resolves
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

// A reference field authored with `.returns("id")` reads the bare
// stored id — the resolution walk skips it so no lookup query runs and
// the id survives untouched. `"returns" in field` narrows to the field
// variants that carry the flag (temporal's `"date"` never matches).
function readsRawReferenceId(field: MetaBoxField | undefined): boolean {
  return field !== undefined && "returns" in field && field.returns === "id";
}

/**
 * Yield every reference-field occurrence in a decoded meta bag: top-level
 * reference fields, plus references nested inside repeater rows and
 * groups at any depth. One structural walk so the resolution pass doesn't
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

/**
 * How a `(kind, scope)` group resolved in Pass 2: adapters with the
 * `hydrate` contract yield payloads keyed by id (values become the
 * hydrated shapes); adapters without it yield the live-id set only
 * (values stay plain ids, orphan-stripped — the pre-hydration read).
 * Either way, an id absent from the result reads as an orphan:
 * single refs null, multi refs drop the item (array stays dense).
 */
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
  // Pass 1: shallow-copy each bag into its output slot, classify each
  // reference occurrence, and accumulate ids per `(kind, scope)`
  // group. Candidates carry their bag references so Pass 3 is a
  // straight walk with no findField / registry re-lookups.
  interface Candidate {
    /** The shallow output copy of the candidate's bag. */
    readonly outBag: ResolvedMeta;
    /** The caller's original decoded bag (for lazy copy-on-write). */
    readonly decoded: ResolvedMeta;
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
      readonly target: ReferenceTarget;
      readonly ids: Set<string>;
    }
  >();
  // Top-level refs and nested (repeater / group) refs get identical
  // treatment, so the single `referenceOccurrences` walk feeds both.
  // Every candidate carries its full path; Pass 3 rewrites the slot in a
  // per-path copy-on-write so callers' bags stay untouched.
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
 * Batched, tag-accounted resolution of a raw id set for one reference kind
 * — the theme-facing counterpart to the meta pipeline's resolution (#1508).
 * A theme holding an id-only reference field (a field declared
 * `.returns("id")`, or one contributed by a third-party plugin) resolves
 * it here instead of hand-rolled per-item fetches: ids resolve through the
 * adapter's batched `hydrate` (chunked, one in-query per chunk) and every
 * resolved entity folds its cache tag into the page through the same
 * accumulator the meta pipeline uses, so the page is purged when an
 * embedded entity changes.
 *
 * Returns the resolved payloads dense and in the requested id order — ids
 * that are gone or out of scope are dropped, mirroring multi-reference
 * field resolution. An unregistered kind, an adapter without the `hydrate`
 * contract, or an empty id set yields `[]`.
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
 * Hydrate one `(kind, scope)` group's ids, keyed for lookup — what a reader
 * holding stored ids from many bags needs, where `resolveReferences` serves
 * one caller-ordered list. Same batching: one in-query per chunk, cache tags
 * accumulated. An unregistered kind, or an adapter without `hydrate`, yields
 * an empty map, so every id in the group reads as an orphan.
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

// What an adapter's `hydrate` may answer differently for — the entry
// adapter clamps unpublished rows on `edit_any`, and on `edit_own` over the
// asker's own rows, so a payload is the asker's view of the row, not the
// row, and varies by `user.id` and not merely by capability. `ctx.memo` is shared by every
// context derived from this one (`withUser`, and the principal-stripped
// one an access policy is resolved against), so naming the asker in the
// key is how this loader meets the principal-invariance the memo asks of
// every loader. Scopes are sorted because they narrow as a set.
function principalKey(ctx: AppContext): string {
  const scopes = ctx.tokenScopes === null ? null : [...ctx.tokenScopes].sort();
  return JSON.stringify([ctx.user?.id ?? null, scopes]);
}

// Resolve one `(kind, scope)` group's aggregated ids. Chunked at
// `HYDRATION_QUERY_ID_LIMIT` per in-query: a response-level group can
// legitimately aggregate more ids than one query may carry (a
// 100-entry archive × multi-reference fields), and a read-path throw
// would kill the render — unlike the write-side `fetchLiveIds`, which
// keeps throwing because a single patch exceeding the ceiling is a
// caller bug. Ids are de-duped before chunking, so per-query batches
// stay bounded and nothing is truncated. Only the `hydrate` arm dedupes
// across batches: #2506 memoizes payloads, and left `list` alone.
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
    // One request runs several resolve batches — an entry page and its
    // related posts, a listing's head re-resolving its first page, an
    // entry's meta beside the attached terms'. Each dedupes only its own
    // ids, so the memo is what keeps a later batch from re-hydrating what
    // an earlier one already has (#2506). The key is a JSON tuple rather
    // than joined text: a scope serializes into `groupKey`, so a
    // concatenation would let one scope's text spill into the id.
    const key = principalKey(ctx);
    const groupKey = referenceGroupKey(target);
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
    );
    const byId = new Map<string, HydratedReference>();
    for (const [index, id] of idList.entries()) {
      // `null` is the memoized miss — an orphan stays an orphan for the
      // rest of the request instead of being re-queried by a later batch.
      // `undefined` cannot happen (one answer per id) but the index read
      // is checked.
      const payload = payloads[index];
      if (payload === null || payload === undefined) continue;
      byId.set(id, payload);
      // Fold this embedded entity's cache tag into the page's tags so a
      // change to it purges the page that hydrated it (#1508). Runs on
      // every read surface; only the public read-through reads the
      // accumulator back, so admin/REST reads populate it harmlessly.
      // Folded here rather than at the hydrate, so a batch answered from
      // the memo tags the page exactly as the batch that loaded it did.
      if (adapter.embeddedCacheTags) {
        accumulateEmbeddedTags(ctx, adapter.embeddedCacheTags(payload));
      }
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

// Walk the candidate's path from the output bag to the parent container
// of its leaf slot, copy-on-writing each container the first time it's
// descended so the caller's `decoded` bag stays untouched. Containers
// cloned by an earlier candidate (identity no longer matches `decoded`)
// are reused, so sibling references in the same row/group land in one
// clone. Returns the writable parent object and the leaf key, or null if
// any segment's runtime shape doesn't match the declared structure
// (hand-edited / migrated bags).
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

/** An addressable node inside a meta bag — what a path segment descends into. */
type MetaContainer = unknown[] | ResolvedMeta;

// Every segment but the last addresses a container, so a leaf (or a missing
// key) reads back as `undefined` and the walk gives up on it — the storage
// shape no longer matches the declared structure.
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
 * A scope's field list paired with a key lookup over it. Decode needs both —
 * the lookup for the keys storage holds, the list for the `.default()`s it
 * does not — and the reference pass needs the lookup, so the two travel
 * together rather than each rebuilding its own.
 */
export interface MetaScope {
  readonly fields: readonly MetaBoxField[];
  readonly findField: (key: string) => MetaBoxField | undefined;
}

export function metaScope(fields: readonly MetaBoxField[]): MetaScope {
  const byKey = new Map<string, MetaBoxField>();
  // First declaration wins, matching the `find*MetaField` helpers this
  // stands in for.
  for (const field of fields) {
    if (!byKey.has(field.key)) byKey.set(field.key, field);
  }
  return { fields, findField: (key) => byKey.get(key) };
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
 * Decode a raw meta bag (as returned by drizzle's JSON-mode column)
 * into the plugin-typed shape RPC consumers expect. Unregistered keys
 * pass through untouched — the row exists in the DB but the plugin
 * that wrote it is no longer installed; we don't pretend to know its
 * shape.
 *
 * Takes the scope's whole field list rather than a lookup because a
 * `.default()` has to stand in where the bag has no key, which needs
 * the fields storage never mentioned. That is also why a row with no
 * saved meta at all still decodes to a bag rather than short-circuiting
 * to `{}`.
 */
export function decodeMetaBag(
  scope: MetaScope,
  raw: JsonObject | null | undefined,
): ResolvedMeta {
  return decodeBag(scope, raw ?? {});
}

/**
 * Decode one bag against the schema that governs it. The top-level meta bag,
 * a repeater row and a group value are the same thing at different depths —
 * a set of declared members plus whatever keys nobody claims — so they share
 * this, and nesting falls out of the recursion through `decodeFieldValue`.
 */
function decodeBag(scope: MetaScope, raw: JsonObject): ResolvedMeta {
  const out: ResolvedMeta = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = scope.findField(key);
    out[key] = field ? decodeFieldValue(field, value) : value;
  }
  applyDefaults(scope.fields, out);
  return out;
}

/**
 * Absence is the only trigger: storage cannot hold `undefined`, so a stored
 * `null` is a value someone chose and keeps its place. The default travels
 * `decodeFieldValue` like a stored value would — it is declared in the
 * stored shape, so `.returns("date")` must still hand back a `Date`.
 */
function applyDefaults(
  fields: readonly MetaBoxField[],
  bag: ResolvedMeta,
): void {
  for (const field of fields) {
    if (field.default === undefined) continue;
    if (Object.hasOwn(bag, field.key)) continue;
    bag[field.key] = decodeFieldValue(field, field.default as JsonValue);
  }
}

// Reference storage is plain ids, but bags written before the
// write-time snapshot machinery was removed may hold `{ id, ... }`
// objects. Reads yield the id; the next save persists the plain form
// (`referenceItemId` accepts the legacy shape on write).
/**
 * One field's value after decode. Wider than the stored JSON because decoding
 * is what moves a value away from it: `.returns("date")` yields a `Date`, and
 * a repeater row or group yields a bag whose members had the same treatment.
 * The field's own `_value` narrows this to the declared read type.
 */
type DecodedValue =
  JsonValue | Date | DecodedRow | readonly DecodedRow[] | undefined;

/** One repeater row, or a group's members: the sub-schema's read shape. */
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
  // Only when the container is present — an absent one reads `undefined`,
  // which is what its own read type says, so there is nothing to fill.
  if (isGroupField(field) && isJsonObject(value)) {
    return decodeBag(metaScope(field.fields), value);
  }
  if (isTemporalField(field) && field.returns === "date") {
    return projectTemporalDate(field.inputType, value);
  }
  // Everything reaching here reads as it is stored, scalars included. Three
  // readers cannot decode — a `WHERE` over the JSON column, a raw row off a
  // lifecycle event, and `storedMeta` behind `whereMeta` — so widening a
  // value to its declared type would answer the other way from all three.
  // The write path settles every form it accepts, so only a row that bypassed
  // it holds an off-schema value, and the next save settles that.
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
   * Top-level keys holding a value — at that key or anywhere inside it — that
   * no declared type accepts. They are left as stored: there is no settled form
   * to pick, and a human has to decide what the value should have been.
   */
  readonly unconvertible: readonly string[];
}

/**
 * Settle a stored bag into the shape its fields declare.
 *
 * Reads are literal (see `decodeFieldValue`), so a row holding an **unsettled
 * value** (`CONTEXT.md`) reads as something its declared type doesn't describe.
 * Settling is what makes the declared type true of the data rather than of the
 * decode.
 *
 * It settles through the write path's own `coerceValue`, so a value lands on
 * exactly what storing it would have produced — there is no second notion of
 * what correct means. A value `coerceValue` rejects is left alone: no schema
 * accepts it, so there is nothing to settle it to, and dropping it would lose
 * data this has no mandate to delete.
 *
 * The recursion mirrors `decodeFieldValue`'s. A repeater row and a group are
 * `json` at the top, so walking only the surface would leave the same class
 * alive one level down.
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
  // `json` covers the containers and the multi-reference, and accepts any JSON
  // — asking it to settle would only re-encode what is already stored.
  // A stored `null` is a value someone chose, read as "no value" — nothing to
  // settle and nothing a human needs to resolve.
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

// `.returns("date")` decode projection. All three variants anchor to
// UTC — `date` at UTC midnight, `time` on 1970-01-01 UTC — so the
// wall-clock components survive every server/browser timezone
// combination (decode runs server-side, often UTC on Workers, while
// the admin formats in the viewer's browser). Consumers read the
// parts back with `getUTC*` or `timeZone: "UTC"` formatting; the
// projection is the exact inverse of the write-side `Date` encoding
// (`formatTemporalValue`). An unparseable stored value rounds to "no
// value": unlike a scalar, a `.returns("date")` field has no honest way
// to hand one back, since its read type is `Date` and the projection is
// the whole reason the bag is not the stored JSON here.
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
 * Merge a validated patch into the given `meta` JSON column for the
 * row identified by `idColumn = id`. Uses SQLite `json_set` /
 * `json_remove` so concurrent updaters touching disjoint keys don't
 * clobber each other at the row level. Deletes nest inside sets so a
 * caller clearing + re-setting the same key in one request behaves
 * predictably.
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
    // drizzle's `update(table)` wants an `AnyTable` shape; our generic
    // constraint only pins `meta`, so the update helper accepts any
    // sqlite table via structural matching. Cast keeps the helper
    // reusable across tables without widening the public types.
    .update(table as never)
    .set({ meta: expr })
    .where(eq(idColumn, id));
}

/**
 * Write a settle back, and only over the values it was settled from.
 *
 * Unlike `applyMetaPatch`, which applies what a caller asked for, this applies
 * what a reader computed from a snapshot. A save landing between that read and
 * this write would otherwise be overwritten with the stale value, so each moved
 * key is guarded: the row is written only while every one still holds what was
 * read, and otherwise left for its next read to settle. `json_extract` on both
 * sides compares scalars by value; a container compares as its JSON text, so
 * one whose spelling doesn't survive a parse (`1.0`) fails closed — left as
 * stored and reported again — rather than risk overwriting a save.
 *
 * `updatedAt` is held where it was. A settle is a normalization, not an edit:
 * moving it would float a row to the top of "recently updated" for having been
 * opened, and hand an editor a lock token the row no longer carries.
 *
 * Returns whether the row was written, which is what decides whether anything
 * gets announced.
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
 * bag, so the result still carries every declared default.
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

// The RPC input schema already rejects `"` and `\`, but belt-and-braces
// matters here because non-RPC callers (tests, hook listeners, future
// surfaces) could bypass that schema and reach a write with such a key.
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
