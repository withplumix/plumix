import type { AppContext } from "../../../context/app.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaPatch } from "../../meta/core.js";
import { entries } from "../../../db/schema/entries.js";
import { findEntryMetaField } from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  filterMetaOrphans as filterMetaOrphansCore,
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

export function decodeMetaBag(
  registry: PluginRegistry,
  entry: { readonly type: string },
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  return decodeMetaBagCore(
    (key) => findEntryMetaField(registry, entry.type, key),
    raw,
  );
}

export async function loadEntryMeta(
  ctx: AppContext,
  entry: { readonly id: number; readonly type: string },
): Promise<Record<string, unknown>> {
  const decoded = await loadMeta(ctx, entries, entries.id, entry.id, (key) =>
    findEntryMetaField(ctx.plugins, entry.type, key),
  );
  return filterMetaOrphansCore(
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
