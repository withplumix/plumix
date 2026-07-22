import type { AppContext } from "../../../context/app.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaPatch } from "../../meta/core.js";
import { terms } from "../../../db/schema/terms.js";
import { findTermMetaField } from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  hydrateMetaReferences as hydrateMetaReferencesCore,
  isEmptyMetaPatch,
  loadMeta,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  validateMetaReferencesForRpc,
} from "../../meta/core.js";
import { assertMetaCapabilities } from "../entry/meta.js";

export type { MetaChanges as TermMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for a term's meta input, scoped by taxonomy. */
export function sanitizeMetaForRpc(
  registry: PluginRegistry,
  taxonomy: string,
  input: Record<string, unknown> | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): MetaPatch | null {
  return sanitizeMetaForRpcCore(
    (key) => findTermMetaField(registry, taxonomy, key),
    input,
    errors,
  );
}

export async function validateTermMetaReferences(
  ctx: AppContext,
  taxonomy: string,
  patch: MetaPatch,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<void> {
  await validateMetaReferencesForRpc(
    ctx,
    (key) => findTermMetaField(ctx.plugins, taxonomy, key),
    patch,
    errors,
  );
}

/** Mirror of `assertEntryMetaCapabilities` for the term meta surface. */
export function assertTermMetaCapabilities(
  registry: PluginRegistry,
  taxonomy: string,
  patch: MetaPatch,
  auth: { can(capability: string): boolean },
  errors: {
    FORBIDDEN: (args: { data: { capability: string } }) => Error;
  },
): void {
  assertMetaCapabilities(
    patch,
    (key) => findTermMetaField(registry, taxonomy, key),
    auth,
    errors,
  );
}

/** Decode + hydrate one term's meta bag for a read response. */
export async function hydrateTermMeta(
  ctx: AppContext,
  taxonomy: string,
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Promise<Record<string, unknown>> {
  const findField = (key: string) =>
    findTermMetaField(ctx.plugins, taxonomy, key);
  return hydrateMetaReferencesCore(
    ctx,
    findField,
    decodeMetaBagCore(findField, raw),
  );
}

export async function loadTermMeta(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
): Promise<Record<string, unknown>> {
  const decoded = await loadMeta(ctx, terms, terms.id, term.id, (key) =>
    findTermMetaField(ctx.plugins, term.taxonomy, key),
  );
  return hydrateMetaReferencesCore(
    ctx,
    (key) => findTermMetaField(ctx.plugins, term.taxonomy, key),
    decoded,
  );
}

/**
 * Apply a meta patch to `terms.meta` and fire `term:meta_changed`.
 * Plugins that need to mutate the patch should subscribe to
 * `rpc:term.{create,update}:input` and mutate `input.meta` there.
 */
export async function writeTermMeta(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
  patch: Parameters<typeof applyMetaPatch>[4],
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;
  await applyMetaPatch(ctx, terms, terms.id, term.id, patch);
  await ctx.hooks.doAction("term:meta_changed", term, {
    set: Object.fromEntries(patch.upserts),
    removed: [...patch.deletes],
  });
}
