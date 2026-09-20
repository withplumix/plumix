// `images.<role>` — an entity's image read by the purpose it serves rather
// than by the meta key that happens to hold it. See ADR 0004.

import * as v from "valibot";

import type { AppContext } from "../context/app.js";
import type { JsonObject } from "../json.js";
import type {
  MetaBoxField,
  ReferenceTarget,
} from "../plugin/fields/meta-box-field.js";
import type {
  ImageRoleField,
  ImageRoleName,
  ImageRoleScope,
  ImageRoleScopeIndex,
} from "../plugin/image-roles.js";
import type { HydratedReference, ResolvedImage } from "../plugin/lookup.js";
import type { PluginRegistry } from "../plugin/registry.js";
import type { ResolvedMeta } from "../rpc/meta/core.js";
import { nonEmpty } from "../non-empty.js";
import { imageRolesInScope } from "../plugin/image-roles.js";
import { extractStringId } from "../rpc/meta/coerce.js";
import { hydrateReferenceGroup, referenceGroupKey } from "../rpc/meta/core.js";
import { referenceTargetOf } from "../rpc/meta/field-pipeline.js";

/**
 * Every image role an entity carries, keyed by role name. A role is present
 * when the entity's scope declares a field in it, and `null` when no field in
 * it resolved to an image — an orphaned reference, or one the adapter refuses.
 */
export type RoleImages = Readonly<
  Partial<Record<ImageRoleName, ResolvedImage | null>>
>;

export interface ProjectImageRolesOptions {
  /**
   * Which of a role's fields may answer for it. REST passes the `showInApi`
   * test, so a role with no exposed field is absent from the response rather
   * than reported as null.
   */
  readonly include?: (field: MetaBoxField) => boolean;
}

// A hydrated payload keeps the adapter's own fields — `looseObject` hands the
// whole thing back so the adapter that produced it reads what it wrote.
const hydratedReferenceSchema = v.looseObject({ id: v.string() });

/**
 * Project one entity's role images out of its already-hydrated meta bag. Pure:
 * every reference the roles read has been resolved by the page's own hydration
 * batch, so this adds no query to any page kind.
 */
export function projectImageRoles(
  plugins: PluginRegistry,
  scope: ImageRoleScope,
  meta: ResolvedMeta,
  options: ProjectImageRolesOptions = {},
): RoleImages {
  return roleImages(
    plugins,
    imageRolesInScope(plugins, scope),
    ({ path }) => readPath(meta, path, hydratedReferenceSchema),
    options.include,
  );
}

/**
 * Every role image of many stored meta bags in one scope — the bulk path for a
 * caller that holds raw `meta` columns rather than resolved entities, such as
 * the sitemap. Results are index-aligned with `bags`.
 *
 * Ids aggregate across every bag and every role before anything is fetched, so
 * a whole page of bags costs one hydration per `(kind, scope)` group per
 * statement-sized chunk of ids — never one per bag.
 */
export async function resolveImageRoles(
  ctx: AppContext,
  scope: ImageRoleScope,
  bags: readonly (JsonObject | null | undefined)[],
): Promise<readonly RoleImages[]> {
  const roles = imageRolesInScope(ctx.plugins, scope);
  if (roles.size === 0) return bags.map(() => ({}));

  // One walk of every bag's role fields: each slot that holds an id is read
  // once, filed under the group that will hydrate it, and remembered so the
  // projection below is a map lookup rather than a second walk.
  const groups = new Map<
    string,
    { readonly target: ReferenceTarget; readonly ids: Set<string> }
  >();
  const roleFields = [...roles.values()].flat();
  const slots = bags.map((bag) => {
    const perField = new Map<ImageRoleField, { group: string; id: string }>();
    for (const entry of roleFields) {
      const target = referenceTargetOf(entry.field);
      const id = storedId(bag ?? {}, entry.path);
      if (!target || id === null) continue;
      const group = referenceGroupKey(target);
      let pending = groups.get(group);
      if (!pending) {
        pending = { target, ids: new Set() };
        groups.set(group, pending);
      }
      pending.ids.add(id);
      perField.set(entry, { group, id });
    }
    return perField;
  });

  const hydrated = new Map(
    await Promise.all(
      [...groups].map(
        async ([key, group]) =>
          [
            key,
            await hydrateReferenceGroup(ctx, group.target, group.ids),
          ] as const,
      ),
    ),
  );

  return slots.map((perField) =>
    roleImages(ctx.plugins, roles, (entry) => {
      const slot = perField.get(entry);
      return slot && hydrated.get(slot.group)?.get(slot.id);
    }),
  );
}

/**
 * The one walk both entry points share: per role, the first field in
 * declaration order whose payload the adapter turns into an image wins, and
 * `null` means none of them did. `payloadOf` is where the two differ — a
 * hydrated bag reads its own slot, a stored bag reads the batch it just
 * hydrated.
 */
function roleImages(
  plugins: PluginRegistry,
  roles: ImageRoleScopeIndex,
  payloadOf: (entry: ImageRoleField) => HydratedReference | null | undefined,
  include?: (field: MetaBoxField) => boolean,
): RoleImages {
  const images: Record<string, ResolvedImage | null> = {};
  for (const [role, fields] of roles) {
    const eligible = include ? fields.filter((f) => include(f.field)) : fields;
    if (eligible.length === 0) continue;
    images[role] = null;
    for (const entry of eligible) {
      const image = imageOf(plugins, entry.field, payloadOf(entry));
      if (image) {
        images[role] = image;
        break;
      }
    }
  }
  return images;
}

/**
 * Hand a payload back to the adapter kind that produced it. An adapter without
 * `image()` — or a slot that held no reference at all, which is how an orphan
 * reads — yields nothing.
 */
function imageOf(
  plugins: PluginRegistry,
  field: MetaBoxField,
  payload: HydratedReference | null | undefined,
): ResolvedImage | null {
  if (!payload || !("referenceTarget" in field)) return null;
  const registered = plugins.lookupAdapters.get(field.referenceTarget.kind);
  return registered?.adapter.image?.(payload) ?? null;
}

/**
 * Read a role field's slot, following the keys of the groups it sits in, and
 * decode the leaf with `leaf`. `null` for a path that leads nowhere and for a
 * value the schema rejects — the two ways a role field answers with no image.
 */
function readPath<TLeaf extends v.GenericSchema>(
  bag: ResolvedMeta,
  path: readonly string[],
  leaf: TLeaf,
): v.InferOutput<TLeaf> | null {
  let current: unknown = bag;
  for (const key of path) {
    if (!isBag(current)) return null;
    current = current[key];
  }
  const value = v.safeParse(leaf, current);
  return value.success ? value.output : null;
}

// A container the walk can descend into. An array is not one — a role is
// rejected at registration anywhere beneath a repeater, so an array on the
// path means the bag no longer matches the fields that declared it.
function isBag(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A stored single reference is the bare id string. A bag that has not been
 * settled since the snapshot shape was retired still holds `{ id, … }` there,
 * and `extractStringId` reads it — the hydrated path gets that for free from
 * `decodeMetaBag`, and a reader of the raw column has to ask for it, or the
 * two surfaces disagree about the same row.
 */
function storedId(bag: JsonObject, path: readonly string[]): string | null {
  const slot = readPath(bag, path, v.unknown());
  return extractStringId(slot) ?? nonEmpty(slot);
}
