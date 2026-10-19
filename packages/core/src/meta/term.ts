import type { Capability } from "../access/contract/capability.js";
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
import { and, eq } from "../db/index.js";
import { terms } from "../db/schema/terms.js";
import { findTermMetaField, listTermMetaFields } from "../plugin/manifest.js";
import {
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  metaScope,
  metaScopeCache,
  patchedMetaBag,
  resolveMetaBags as resolveMetaBagsCore,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  settleStoredMeta,
  validateMetaReferencesForRpc,
} from "./core.js";
import { assertMetaCapabilities } from "./entry.js";

export type { MetaChanges as TermMetaChanges } from "./core.js";

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
  auth: { can(capability: Capability): boolean },
  errors: CapabilityErrors,
): void {
  assertMetaCapabilities(
    registry,
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
 * Writes, so never call it from a read an anonymous caller can reach. The
 * public renderer reads term meta elsewhere.
 */
export async function settleTermMeta(
  ctx: AppContext,
  term: SettledTerm,
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

/** The term as the settle read it: its version is the settle's claim. */
interface SettledTerm {
  readonly id: number;
  readonly taxonomy: string;
  readonly version: number;
}

/**
 * Lands only while the row holds the version it was read with, so a write in
 * between wins, and leaves it there: a settle is not an edit.
 */
export async function writeSettledTermMeta(
  ctx: AppContext,
  term: SettledTerm,
  stored: JsonObject | null | undefined,
  patch: MetaPatch,
): Promise<boolean> {
  if (isEmptyMetaPatch(patch)) return false;
  const written = await ctx.db
    .update(terms)
    .set({
      meta: patchedMetaBag(stored, patch),
      // Set, so `$onUpdate` doesn't move it.
      version: term.version,
    })
    .where(and(eq(terms.id, term.id), eq(terms.version, term.version)))
    .returning({ id: terms.id });
  if (written.length === 0) return false;
  await announceTermMetaChange(ctx, term, patch);
  return true;
}

/** Fire `term:meta_changed` once a write carrying `patch` has landed. */
export function announceTermMetaChange(
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
