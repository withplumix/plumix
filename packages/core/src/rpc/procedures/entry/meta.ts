import type { AppContext } from "../../../context/app.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaPatch } from "../../meta/core.js";
import type { FieldPipelineMode } from "../../meta/field-pipeline.js";
import { entries } from "../../../db/schema/entries.js";
import {
  findEntryMetaField,
  listEntryMetaFields,
} from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  loadMeta,
  metaValidationConflict,
  MetaValidationError,
  resolveMetaBags as resolveMetaBagsCore,
  resolveMetaReferences as resolveMetaReferencesCore,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  validateAndPromoteMetaBag,
  validateMetaReferencesForRpc,
} from "../../meta/core.js";

export type { MetaChanges as EntryMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for an entry's meta input, scoped by entry type. */
export async function sanitizeMetaForRpc(
  registry: PluginRegistry,
  entryType: string,
  input: Record<string, unknown> | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
  mode: FieldPipelineMode = "strict",
): Promise<MetaPatch | null> {
  return sanitizeMetaForRpcCore(
    (key) => findEntryMetaField(registry, entryType, key),
    input,
    errors,
    mode,
  );
}

/**
 * Reject a meta patch that writes to a capability-gated field the viewer
 * can't access. Treats the field's `capability` as a server-side gate so
 * the API stays honest regardless of admin-side filtering. Deletes count
 * as writes — you can't blank a value you can't see. Repeater subfields
 * are NOT recursed: capability gates apply at the top-level field only;
 * a row's capability is whichever the parent repeater field declares.
 */
export function assertEntryMetaCapabilities(
  registry: PluginRegistry,
  entryType: string,
  patch: MetaPatch,
  auth: { can(capability: string): boolean },
  errors: {
    FORBIDDEN: (args: { data: { capability: string } }) => Error;
  },
): void {
  assertMetaCapabilities(
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
  patch: MetaPatch,
  findField: (key: string) => { readonly capability?: string } | undefined,
  auth: { can(capability: string): boolean },
  errors: {
    FORBIDDEN: (args: { data: { capability: string } }) => Error;
  },
): void {
  const touched = new Set<string>([...patch.upserts.keys(), ...patch.deletes]);
  for (const key of touched) {
    const field = findField(key);
    if (!field?.capability) continue;
    if (!auth.can(field.capability)) {
      throw errors.FORBIDDEN({ data: { capability: field.capability } });
    }
  }
}

/**
 * Async second pass on a sanitised entry-meta patch: validates each
 * reference field's upserted ID against its registered
 * `LookupAdapter`. RPC procedures call this between
 * `sanitizeMetaForRpc` and `writeEntryMeta`.
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
  input: Record<string, unknown> | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2] &
    Parameters<typeof assertEntryMetaCapabilities>[4],
  mode: FieldPipelineMode = "strict",
): Promise<MetaPatch | null> {
  const patch = await sanitizeMetaForRpc(
    ctx.plugins,
    entryType,
    input,
    errors,
    mode,
  );
  if (!patch) return null;
  assertEntryMetaCapabilities(ctx.plugins, entryType, patch, ctx.auth, errors);
  await validateEntryMetaReferences(ctx, entryType, patch, errors);
  return patch;
}

/**
 * Strict-validate a stored entry-meta bag before `entry.publish` promotes
 * it onto the live row. Draft autosaves are lenient, so this is the gate
 * that finally enforces required fields, bounds, formats, and row counts;
 * a violation aggregates into a `CONFLICT` the admin pins onto its inputs,
 * blocking the publish. See {@link validateAndPromoteMetaBag}.
 *
 * Capability-gated fields the publisher can't write are excluded from the
 * check: they can't fix such a field, so a co-author's required/invalid
 * value must not block their publish (its stored value still passes through
 * untouched, and was validated when whoever set it wrote it).
 */
export async function sanitizePromotedEntryMeta(
  ctx: AppContext,
  entryType: string,
  bag: Readonly<Record<string, unknown>>,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<Record<string, unknown>> {
  const fields = listEntryMetaFields(ctx.plugins, entryType).filter(
    (field) => !field.capability || ctx.auth.can(field.capability),
  );
  try {
    return await validateAndPromoteMetaBag(fields, bag);
  } catch (error) {
    if (error instanceof MetaValidationError) {
      throw metaValidationConflict(error, errors);
    }
    throw error;
  }
}

/**
 * Decode + resolve one entry's meta bag for a read response. Use
 * {@link resolveEntriesMeta} for multi-entry responses so ids
 * aggregate into one in-query per `(kind, scope)` group.
 */
export async function resolveEntryMeta(
  ctx: AppContext,
  entry: { readonly type: string },
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Promise<Record<string, unknown>> {
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
    readonly meta: Readonly<Record<string, unknown>> | null | undefined;
  }[],
): Promise<Record<string, unknown>[]> {
  return resolveMetaBagsCore(
    ctx,
    rows.map((row) => {
      const findField = (key: string) =>
        findEntryMetaField(ctx.plugins, row.type, key);
      return { findField, decoded: decodeMetaBagCore(findField, row.meta) };
    }),
  );
}

export async function loadEntryMeta(
  ctx: AppContext,
  entry: { readonly id: number; readonly type: string },
): Promise<Record<string, unknown>> {
  const decoded = await loadMeta(ctx, entries, entries.id, entry.id, (key) =>
    findEntryMetaField(ctx.plugins, entry.type, key),
  );
  return resolveMetaReferencesCore(
    ctx,
    (key) => findEntryMetaField(ctx.plugins, entry.type, key),
    decoded,
  );
}

/**
 * Apply a meta patch to `entries.meta` and fire `entry:meta_changed`.
 * Plugins that need to mutate the patch subscribe to
 * `rpc:entry.{create,update}:input` and mutate `input.meta` there.
 */
export async function writeEntryMeta(
  ctx: AppContext,
  entry: { readonly id: number; readonly type: string },
  patch: Parameters<typeof applyMetaPatch>[4],
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;
  await applyMetaPatch(ctx, entries, entries.id, entry.id, patch);
  await ctx.hooks.doAction("entry:meta_changed", entry, {
    set: Object.fromEntries(patch.upserts),
    removed: [...patch.deletes],
  });
}
