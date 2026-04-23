import type { AppContext } from "../../../context/app.js";
import type { PluginRegistry } from "../../../plugin/manifest.js";
import type { MetaPatch } from "../../meta/core.js";
import { users } from "../../../db/schema/users.js";
import { findUserMetaField } from "../../../plugin/manifest.js";
import {
  applyMetaPatch,
  decodeMetaBag as decodeMetaBagCore,
  isEmptyMetaPatch,
  loadMeta,
  sanitizeMetaForRpc as sanitizeMetaForRpcCore,
} from "../../meta/core.js";

export type { MetaChanges as UserMetaChanges } from "../../meta/core.js";

/** RPC-facing sanitizer for a user's meta input. User meta is a flat
 *  keyspace — no scope argument. */
export function sanitizeMetaForRpc(
  registry: PluginRegistry,
  input: Record<string, unknown> | undefined,
  errors: Parameters<typeof sanitizeMetaForRpcCore>[2],
): MetaPatch | null {
  return sanitizeMetaForRpcCore(
    (key) => findUserMetaField(registry, key),
    input,
    errors,
  );
}

export function decodeMetaBag(
  registry: PluginRegistry,
  raw: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
  return decodeMetaBagCore((key) => findUserMetaField(registry, key), raw);
}

export async function loadUserMeta(
  ctx: AppContext,
  user: { readonly id: number },
): Promise<Record<string, unknown>> {
  return loadMeta(ctx, users, users.id, user.id, (key) =>
    findUserMetaField(ctx.plugins, key),
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
  patch: Parameters<typeof applyMetaPatch>[4],
): Promise<void> {
  if (isEmptyMetaPatch(patch)) return;
  await applyMetaPatch(ctx, users, users.id, user.id, patch);
  await ctx.hooks.doAction("user:meta_changed", user, {
    set: Object.fromEntries(patch.upserts),
    removed: [...patch.deletes],
  });
}
