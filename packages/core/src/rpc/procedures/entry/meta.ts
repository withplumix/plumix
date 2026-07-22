import type { AppContext } from "../../../context/app.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaPatch } from "../../meta/core.js";
import { entries } from "../../../db/schema/entries.js";
import { findEntryMetaField } from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  hydrateMetaBags as hydrateMetaBagsCore,
  hydrateMetaReferences as hydrateMetaReferencesCore,
  isEmptyMetaPatch,
  loadMeta,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  validateMetaReferencesForRpc,
} from "../../meta/core.js";

export type { MetaChanges as EntryMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for an entry's meta input, scoped by entry type. */
export function sanitizeMetaForRpc(
  registry: PluginRegistry,
  entryType: string,
  input: Record<string, unknown> | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): MetaPatch | null {
  return sanitizeMetaForRpcCore(
    (key) => findEntryMetaField(registry, entryType, key),
    input,
    errors,
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
 * Decode + hydrate one entry's meta bag for a read response. Use
 * {@link hydrateEntriesMeta} for multi-entry responses so ids
 * aggregate into one in-query per `(kind, scope)` group.
 */
export async function hydrateEntryMeta(
  ctx: AppContext,
  entry: { readonly type: string },
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Promise<Record<string, unknown>> {
  const [bag] = await hydrateEntriesMeta(ctx, [
    { type: entry.type, meta: raw },
  ]);
  return bag ?? {};
}

/**
 * Decode + hydrate meta bags for a whole read response, one result per
 * row (index-aligned). All reference ids across all rows resolve
 * through the shared batched pipeline.
 */
export async function hydrateEntriesMeta(
  ctx: AppContext,
  rows: readonly {
    readonly type: string;
    readonly meta: Readonly<Record<string, unknown>> | null | undefined;
  }[],
): Promise<Record<string, unknown>[]> {
  return hydrateMetaBagsCore(
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
  return hydrateMetaReferencesCore(
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
