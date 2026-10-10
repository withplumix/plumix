// `images.<role>` — an entity's image read by the purpose it serves rather
// than by the meta key that happens to hold it. See ADR 0004.

import * as v from "valibot";

import type { AppContext } from "../context/app-context.js";
import type { JsonObject } from "../json.js";
import type { ResolvedMeta } from "../meta/contract/bags.js";
import type {
  MetaBoxField,
  ReferenceTarget,
} from "../plugin/fields/meta-box-field.js";
import type {
  ImageRoleField,
  ImageRoleScope,
  ImageRoleScopeIndex,
} from "../plugin/image-roles.js";
import type { HydratedReference } from "../plugin/lookup.js";
import type { PluginRegistry } from "../plugin/registry.js";
import type { ResolvedImage, RoleImages } from "./contract/role-images.js";
import { extractStringId } from "../meta/coerce.js";
import { hydrateReferenceGroup, referenceGroupKey } from "../meta/core.js";
import { referenceTargetOf } from "../meta/field-pipeline.js";
import { nonEmpty } from "../non-empty.js";
import { imageRolesInScope } from "../plugin/image-roles.js";

export interface ProjectImageRolesOptions {
  /**
   * REST passes its `showInApi` test, so a role with no exposed field is
   * absent rather than null.
   */
  readonly include?: (field: MetaBoxField) => boolean;
}

// A hydrated payload keeps the adapter's own fields — `looseObject` hands the
// whole thing back so the adapter that produced it reads what it wrote.
const hydratedReferenceSchema = v.looseObject({ id: v.string() });

/** Adds no query: the page's own hydration already resolved every reference. */
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
 * For raw `meta` columns, such as the sitemap's. Index-aligned with `bags`;
 * one hydration per `(kind, scope)` group per chunk, never per bag.
 */
export async function resolveImageRoles(
  ctx: AppContext,
  scope: ImageRoleScope,
  bags: readonly (JsonObject | null | undefined)[],
): Promise<readonly RoleImages[]> {
  const roles = imageRolesInScope(ctx.plugins, scope);
  if (roles.size === 0) return bags.map(() => ({}));

  // Slots are remembered so the projection below is a lookup, not a second
  // walk.
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

// Per role, the first field in declaration order that yields an image wins.
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

function imageOf(
  plugins: PluginRegistry,
  field: MetaBoxField,
  payload: HydratedReference | null | undefined,
): ResolvedImage | null {
  if (!payload || !("referenceTarget" in field)) return null;
  const registered = plugins.lookupAdapters.get(field.referenceTarget.kind);
  return registered?.adapter.image?.(payload) ?? null;
}

// `null` for a path leading nowhere and for a value the schema rejects.
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

// Roles are rejected under repeaters, so an array on the path means the bag no
// longer matches its fields.
function isBag(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// An unsettled bag may still hold the retired `{ id, … }` shape; the raw-column
// reader must accept it or disagree with the hydrated path.
function storedId(bag: JsonObject, path: readonly string[]): string | null {
  const slot = readPath(bag, path, v.unknown());
  return extractStringId(slot) ?? nonEmpty(slot);
}
