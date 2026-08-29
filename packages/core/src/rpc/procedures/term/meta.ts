import type { AppContext } from "../../../context/app.js";
import type { JsonObject } from "../../../json.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaInput, MetaPatch, ResolvedMeta } from "../../meta/core.js";
import { terms } from "../../../db/schema/terms.js";
import {
  findTermMetaField,
  listTermMetaFields,
} from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  loadMeta,
  metaScope,
  metaScopeCache,
  resolveMetaBags as resolveMetaBagsCore,
  resolveMetaReferences as resolveMetaReferencesCore,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  validateMetaReferencesForRpc,
} from "../../meta/core.js";
import { assertMetaCapabilities } from "../entry/meta.js";

export type { MetaChanges as TermMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for a term's meta input, scoped by taxonomy. */
export async function sanitizeMetaForRpc(
  registry: PluginRegistry,
  taxonomy: string,
  input: MetaInput | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<MetaPatch | null> {
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

/**
 * Decode + resolve one term's meta bag for a read response. Use
 * {@link resolveTermsMeta} for multi-term responses so ids aggregate
 * into one in-query per `(kind, scope)` group.
 */
export async function resolveTermMeta(
  ctx: AppContext,
  taxonomy: string,
  raw: JsonObject | null | undefined,
): Promise<ResolvedMeta> {
  const [bag] = await resolveTermsMeta(ctx, [{ taxonomy, meta: raw }]);
  return bag ?? {};
}

/**
 * Decode + resolve meta bags for a whole set of terms, one result per
 * row (index-aligned). All reference ids across all rows resolve
 * through the shared batched pipeline.
 */
export async function resolveTermsMeta(
  ctx: AppContext,
  rows: readonly {
    readonly taxonomy: string;
    readonly meta: JsonObject | null | undefined;
  }[],
): Promise<ResolvedMeta[]> {
  const scopeFor = metaScopeCache((taxonomy) =>
    listTermMetaFields(ctx.plugins, taxonomy),
  );
  return resolveMetaBagsCore(
    ctx,
    rows.map((row) => {
      const scope = scopeFor(row.taxonomy);
      return {
        findField: scope.findField,
        decoded: decodeMetaBagCore(scope, row.meta),
      };
    }),
  );
}

export async function loadTermMeta(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
): Promise<ResolvedMeta> {
  const scope = metaScope(listTermMetaFields(ctx.plugins, term.taxonomy));
  const decoded = await loadMeta(ctx, terms, terms.id, term.id, scope);
  return resolveMetaReferencesCore(ctx, scope.findField, decoded);
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
