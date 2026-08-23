import type { AppContext } from "../../../context/app.js";
import type { JsonObject } from "../../../json.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaInput, MetaPatch, ResolvedMeta } from "../../meta/core.js";
import { users } from "../../../db/schema/users.js";
import { findUserMetaField } from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  loadMeta,
  resolveMetaReferences as resolveMetaReferencesCore,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
  validateMetaReferencesForRpc,
} from "../../meta/core.js";
import { assertMetaCapabilities } from "../entry/meta.js";

export type { MetaChanges as UserMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for a user's meta input. User meta is a flat
 *  keyspace — no scope argument. */
export async function sanitizeMetaForRpc(
  registry: PluginRegistry,
  input: MetaInput | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<MetaPatch | null> {
  return sanitizeMetaForRpcCore(
    (key) => findUserMetaField(registry, key),
    input,
    errors,
  );
}

export async function validateUserMetaReferences(
  ctx: AppContext,
  patch: MetaPatch,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): Promise<void> {
  await validateMetaReferencesForRpc(
    ctx,
    (key) => findUserMetaField(ctx.plugins, key),
    patch,
    errors,
  );
}

/** Mirror of `assertEntryMetaCapabilities` for the user meta surface. */
export function assertUserMetaCapabilities(
  registry: PluginRegistry,
  patch: MetaPatch,
  auth: { can(capability: string): boolean },
  errors: {
    FORBIDDEN: (args: { data: { capability: string } }) => Error;
  },
): void {
  assertMetaCapabilities(
    patch,
    (key) => findUserMetaField(registry, key),
    auth,
    errors,
  );
}

/** Decode + resolve one user's meta bag for a read response. */
export async function resolveUserMeta(
  ctx: AppContext,
  raw: JsonObject | null | undefined,
): Promise<ResolvedMeta> {
  const findField = (key: string) => findUserMetaField(ctx.plugins, key);
  return resolveMetaReferencesCore(
    ctx,
    findField,
    decodeMetaBagCore(findField, raw),
  );
}

export async function loadUserMeta(
  ctx: AppContext,
  user: { readonly id: number },
): Promise<ResolvedMeta> {
  const decoded = await loadMeta(ctx, users, users.id, user.id, (key) =>
    findUserMetaField(ctx.plugins, key),
  );
  return resolveMetaReferencesCore(
    ctx,
    (key) => findUserMetaField(ctx.plugins, key),
    decoded,
  );
}

/**
 * Apply a meta patch to `users.meta` and fire `user:meta_changed`.
 * Plugins that need to mutate the patch subscribe to
 * `rpc:user.update:input` and mutate `input.meta` there.
 */
export async function writeUserMeta(
  ctx: AppContext,
  user: { readonly id: number },
  patch: MetaPatch,
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;
  await applyMetaPatch(ctx, users, users.id, user.id, patch);
  await ctx.hooks.doAction("user:meta_changed", user, {
    set: Object.fromEntries(patch.upserts),
    removed: [...patch.deletes],
  });
}
