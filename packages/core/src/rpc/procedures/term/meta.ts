import type { AppContext } from "../../../context/app.js";
import type {
  MetaBoxField,
  PluginRegistry,
} from "../../../plugin/manifest.js";
import { terms } from "../../../db/schema/terms.js";
import { findTermMetaField } from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  loadMeta,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
} from "../../meta/core.js";

export type { MetaChanges as TermMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for a term's meta input, scoped by taxonomy. */
export function sanitizeMetaForRpc(
  registry: PluginRegistry,
  taxonomy: string,
  input: Record<string, unknown> | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
) {
  return sanitizeMetaForRpcCore(
    (key) => findTermMetaField(registry, taxonomy, key),
    input,
    errors,
  );
}

export function decodeMetaBag(
  registry: PluginRegistry,
  taxonomy: string,
  raw: Readonly<Record<string, unknown>> | null | undefined,
) {
  const finder = (key: string): MetaBoxField | undefined =>
    findTermMetaField(registry, taxonomy, key);
  return decodeMetaBagCore(finder, raw);
}

export async function loadTermMeta(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
): Promise<Record<string, unknown>> {
  return loadMeta(ctx, terms, terms.id, term.id, (key) =>
    findTermMetaField(ctx.plugins, term.taxonomy, key),
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
