import type { JsonObject } from "../json.js";
import type { MetaBoxField } from "../plugin/fields/meta-box-field.js";
import type { PluginRegistry } from "../plugin/registry.js";
import {
  listEntryMetaFields,
  listTermMetaFields,
  listUserMetaFields,
} from "../plugin/registry.js";
import { metaScope, settleStoredMeta } from "../rpc/meta/core.js";

/**
 * Who a meta bag belongs to: an entry type, a taxonomy, a settings group, or
 * users, whose meta has one flat keyspace.
 */
export type MetaOwner =
  | { readonly entryType: string }
  | { readonly taxonomy: string }
  | { readonly settingsGroup: string }
  | "user";

/**
 * Settle a meta bag against the fields registered for its owner, so a direct
 * write stores what the declared types describe — what a save through core
 * would have stored. A raw `db.update(...).set({ meta })` bypasses the field
 * pipeline, and a `1` under a toggle would otherwise read back as `1`.
 *
 * The same settle the admin's read heal and `plumix meta settle` apply. A
 * value no declared type accepts, and a key no registered field owns, come
 * back as given.
 */
export function settleMeta(
  ctx: { readonly plugins: PluginRegistry },
  owner: MetaOwner,
  meta: JsonObject,
): JsonObject {
  return settleStoredMeta(metaScope(fieldsOf(ctx.plugins, owner)), meta).bag;
}

function fieldsOf(
  registry: PluginRegistry,
  owner: MetaOwner,
): readonly MetaBoxField[] {
  if (owner === "user") return listUserMetaFields(registry);
  if ("entryType" in owner)
    return listEntryMetaFields(registry, owner.entryType);
  if ("taxonomy" in owner) return listTermMetaFields(registry, owner.taxonomy);
  return registry.settingsGroups.get(owner.settingsGroup)?.fields ?? [];
}
