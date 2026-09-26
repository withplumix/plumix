import type { AppContext } from "../../../context/app.js";
import type { JsonObject } from "../../../json.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { CapabilityErrors } from "../../errors.js";
import type {
  MetaInput,
  MetaPatch,
  MetaPatchTarget,
  ResolvedMeta,
  SettledRow,
} from "../../meta/core.js";
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
  settleStoredMeta,
  validateMetaReferencesForRpc,
  writeSettledMeta,
} from "../../meta/core.js";
import { assertMetaCapabilities } from "../entry/meta.js";

export type { MetaChanges as TermMetaChanges } from "../../meta/core.js";

/**
 * RPC-facing sanitizer for a term's meta input, scoped by taxonomy. The
 * target's `stored` is the meta the patch lands on — `{}` for a new term.
 */
export async function sanitizeMetaForRpc(
  registry: PluginRegistry,
  taxonomy: string,
  input: MetaInput | undefined,
  target: Omit<MetaPatchTarget, "fields">,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<MetaPatch | null> {
  return sanitizeMetaForRpcCore(
    { ...target, fields: listTermMetaFields(registry, taxonomy) },
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
  errors: CapabilityErrors,
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

/**
 * Settle one term's stored bag and return the bag a reader should decode —
 * the term counterpart of `settleEntryMeta`, which says why the settle hangs
 * off the single-item read and not the decode. The public renderer reads term
 * meta through `page-data.ts` and `build-resolved-entries.ts`, neither of
 * which comes through here.
 */
export async function settleTermMeta(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
  stored: JsonObject | null | undefined,
): Promise<SettledRow> {
  const settled = settleStoredMeta(
    metaScope(listTermMetaFields(ctx.plugins, term.taxonomy)),
    stored,
  );
  return {
    ...settled,
    written: await writeSettledTermMeta(ctx, term, stored, settled.patch),
  };
}

/**
 * Write back a settle already computed from `stored`, and announce it if it
 * landed — the step the bulk sweep shares with the read heal, so both write and
 * announce the same way.
 */
export async function writeSettledTermMeta(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
  stored: JsonObject | null | undefined,
  patch: MetaPatch,
): Promise<boolean> {
  const written = await writeSettledMeta(
    ctx,
    terms,
    terms.id,
    term.id,
    stored,
    patch,
  );
  if (written) await announceTermMetaChange(ctx, term, patch);
  return written;
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
  await announceTermMetaChange(ctx, term, patch);
}

function announceTermMetaChange(
  ctx: AppContext,
  term: { readonly id: number; readonly taxonomy: string },
  patch: MetaPatch,
): Promise<void> {
  return ctx.hooks.doAction(
    "term:meta_changed",
    term,
    {
      set: Object.fromEntries(patch.upserts),
      removed: [...patch.deletes],
    },
    ctx,
  );
}
