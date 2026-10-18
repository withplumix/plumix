import type {
  Capability,
  CapabilityNamespaces,
} from "../access/contract/capability.js";
import type { AppContext } from "../context/app-context.js";
import type { JsonObject } from "../json.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { CapabilityErrors } from "../rpc-errors.js";
import type { ResolvedMeta } from "./contract/bags.js";
import type {
  MetaInput,
  MetaPatch,
  MetaPatchTarget,
  SettledRow,
} from "./core.js";
import type { FieldPipelineMode } from "./field-pipeline.js";
import { resolveCapability } from "../access/contract/capability.js";
import { and, eq } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { findEntryMetaField, listEntryMetaFields } from "../plugin/manifest.js";
import {
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  loadMeta,
  metaScope,
  metaScopeCache,
  metaValidationConflict,
  MetaValidationError,
  patchedMetaBag,
  resolveMetaBags as resolveMetaBagsCore,
  resolveMetaReferences as resolveMetaReferencesCore,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  settleStoredMeta,
  validateAndPromoteMetaBag,
  validateMetaReferencesForRpc,
} from "./core.js";

export type { MetaChanges as EntryMetaChanges } from "./core.js";

/**
 * RPC-facing sanitizer for an entry's meta input, scoped by entry type. The
 * target's `stored` is the meta the patch lands on — `{}` for a new entry.
 */
export async function sanitizeMetaForRpc(
  registry: PluginRegistry,
  entryType: string,
  input: MetaInput | undefined,
  target: Omit<MetaPatchTarget, "fields">,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
  mode: FieldPipelineMode = "strict",
): Promise<MetaPatch | null> {
  return sanitizeMetaForRpcCore(
    { ...target, fields: listEntryMetaFields(registry, entryType) },
    input,
    errors,
    mode,
  );
}

/**
 * Deletes count as writes. Capability gates apply at the top-level field
 * only; repeater subfields are not recursed.
 */
export function assertEntryMetaCapabilities(
  registry: PluginRegistry,
  entryType: string,
  patch: MetaPatch,
  auth: { can(capability: Capability): boolean },
  errors: CapabilityErrors,
): void {
  assertMetaCapabilities(
    registry,
    patch,
    (key) => findEntryMetaField(registry, entryType, key),
    auth,
    errors,
  );
}

/**
 * Generic shape — `term.{create,update}` and `user.update` reuse this by
 * passing their own `findField` lookup so all three surfaces honour the
 * field-level capability gate uniformly.
 */
export function assertMetaCapabilities(
  registry: CapabilityNamespaces,
  patch: MetaPatch,
  findField: (key: string) => { readonly capability?: Capability } | undefined,
  auth: { can(capability: Capability): boolean },
  errors: CapabilityErrors,
): void {
  const touched = new Set<string>([...patch.upserts.keys(), ...patch.deletes]);
  for (const key of touched) {
    const field = findField(key);
    if (!field?.capability) continue;
    if (!auth.can(field.capability)) {
      throw errors.FORBIDDEN({
        data: { capability: resolveCapability(registry, field.capability) },
      });
    }
  }
}

/**
 * Async second pass on a sanitised entry-meta patch: validates each
 * reference field's upserted ID against its registered
 * `LookupAdapter`. RPC procedures call this between
 * `sanitizeMetaForRpc` and the write.
 */
export async function validateEntryMetaReferences(
  ctx: AppContext,
  entryType: string,
  patch: MetaPatch,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<void> {
  await validateMetaReferencesForRpc(
    ctx,
    (key) => findEntryMetaField(ctx.plugins, entryType, key),
    patch,
    errors,
  );
}

/**
 * Full RPC gate for caller-supplied entry meta: sanitize the input,
 * then enforce field capabilities and reference integrity on the
 * resulting patch.
 */
export async function sanitizeAndValidateEntryMeta(
  ctx: AppContext,
  entryType: string,
  input: MetaInput | undefined,
  stored: JsonObject,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2] &
    Parameters<typeof assertEntryMetaCapabilities>[4],
  mode: FieldPipelineMode = "strict",
): Promise<MetaPatch | null> {
  const patch = await sanitizeMetaForRpc(
    ctx.plugins,
    entryType,
    input,
    { stored, auth: ctx.auth },
    errors,
    mode,
  );
  if (!patch) return null;
  assertEntryMetaCapabilities(ctx.plugins, entryType, patch, ctx.auth, errors);
  await validateEntryMetaReferences(ctx, entryType, patch, errors);
  return patch;
}

/**
 * Excludes capability-gated fields the publisher can't write, so a co-author's
 * invalid value can't block their publish. Only `touched` keys are rewritten.
 */
export async function sanitizePromotedEntryMeta(
  ctx: AppContext,
  entryType: string,
  bag: JsonObject,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
  touched: ReadonlySet<string>,
): Promise<JsonObject> {
  const fields = listEntryMetaFields(ctx.plugins, entryType).filter(
    (field) => !field.capability || ctx.auth.can(field.capability),
  );
  try {
    return await validateAndPromoteMetaBag(fields, bag, touched);
  } catch (error) {
    if (error instanceof MetaValidationError) {
      throw metaValidationConflict(error, errors);
    }
    throw error;
  }
}

/**
 * The same gate for its rejection alone, for a live write whose rest of row is
 * already settled. Nothing is rewritten.
 */
export async function assertPromotedEntryMetaValid(
  ctx: AppContext,
  entryType: string,
  bag: JsonObject,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<void> {
  await sanitizePromotedEntryMeta(ctx, entryType, bag, errors, new Set());
}

/**
 * Decode + resolve one entry's meta bag for a read response. Use
 * {@link resolveEntriesMeta} for multi-entry responses so ids
 * aggregate into one in-query per `(kind, scope)` group.
 */
export async function resolveEntryMeta(
  ctx: AppContext,
  entry: { readonly type: string },
  raw: JsonObject | null | undefined,
): Promise<ResolvedMeta> {
  const [bag] = await resolveEntriesMeta(ctx, [
    { type: entry.type, meta: raw },
  ]);
  return bag ?? {};
}

/**
 * Decode + resolve meta bags for a whole read response, one result per
 * row (index-aligned). All reference ids across all rows resolve
 * through the shared batched pipeline.
 */
export async function resolveEntriesMeta(
  ctx: AppContext,
  rows: readonly {
    readonly type: string;
    readonly meta: JsonObject | null | undefined;
  }[],
): Promise<ResolvedMeta[]> {
  const scopeFor = metaScopeCache((type) =>
    listEntryMetaFields(ctx.plugins, type),
  );
  return resolveMetaBagsCore(
    ctx,
    rows.map((row) => {
      const scope = scopeFor(row.type);
      return {
        findField: scope.findField,
        decoded: decodeMetaBagCore(scope, row.meta),
      };
    }),
  );
}

/**
 * Writes, so never call it from a read an anonymous caller can reach: that
 * would put database traffic and CDN purges behind anonymous requests.
 */
export async function settleEntryMeta(
  ctx: AppContext,
  entry: SettledEntry,
  stored: JsonObject | null | undefined,
): Promise<SettledRow> {
  const settled = settleStoredMeta(
    metaScope(listEntryMetaFields(ctx.plugins, entry.type)),
    stored,
  );
  return {
    ...settled,
    written: await writeSettledEntryMeta(ctx, entry, stored, settled.patch),
  };
}

/** The entry as the settle read it: its token is the settle's claim. */
interface SettledEntry {
  readonly id: number;
  readonly type: string;
  readonly updatedAt: Date;
}

/**
 * Lands only while the row holds the token it was read with, so a write in
 * between wins, and pins it: a settle is not an edit.
 */
export async function writeSettledEntryMeta(
  ctx: AppContext,
  entry: SettledEntry,
  stored: JsonObject | null | undefined,
  patch: MetaPatch,
): Promise<boolean> {
  if (isEmptyMetaPatch(patch)) return false;
  const written = await ctx.db
    .update(entries)
    .set({
      meta: patchedMetaBag(stored, patch),
      // Set, so `$onUpdate` doesn't move it.
      updatedAt: entry.updatedAt,
    })
    .where(
      and(eq(entries.id, entry.id), eq(entries.updatedAt, entry.updatedAt)),
    )
    .returning({ id: entries.id });
  if (written.length === 0) return false;
  await announceEntryMetaChange(ctx, entry, patch);
  return true;
}

export async function loadEntryMeta(
  ctx: AppContext,
  entry: { readonly id: number; readonly type: string },
): Promise<ResolvedMeta> {
  const scope = metaScope(listEntryMetaFields(ctx.plugins, entry.type));
  const decoded = await loadMeta(ctx, entries, entries.id, entry.id, scope);
  return resolveMetaReferencesCore(ctx, scope.findField, decoded);
}

/**
 * Fire `entry:meta_changed` once a write carrying `patch` has landed. Plugins
 * that need to mutate the patch subscribe to `rpc:entry.{create,update}:input`
 * and mutate `input.meta` there.
 */
export function announceEntryMetaChange(
  ctx: AppContext,
  entry: { readonly id: number; readonly type: string },
  patch: MetaPatch,
): Promise<void> {
  return ctx.hooks.doAction(
    "entry:meta_changed",
    entry,
    {
      set: Object.fromEntries(patch.upserts),
      removed: [...patch.deletes],
    },
    ctx,
  );
}
