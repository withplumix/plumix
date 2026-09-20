// The image-role index: every role-tagged media field, resolved once per scope
// so a reader asks for "the entry's featured image" instead of walking meta
// boxes for it. See ADR 0004.

import type { MetaBoxField } from "./fields/meta-box-field.js";
import type { PluginRegistry } from "./registry.js";
import { PluginDefinitionError } from "./errors.js";

/**
 * The image roles a field may carry, keyed by name. Core declares `featured`
 * and `ogImage`; a plugin or theme that registers another with
 * `registerImageRole` augments this interface so `.role()` accepts the name:
 *
 * ```ts
 * declare module "plumix" {
 *   interface ImageRoles { hero: true }
 * }
 * ```
 */
export interface ImageRoles {
  featured: true;
  ogImage: true;
}

export type ImageRoleName = keyof ImageRoles;

export interface ImageRoleOptions {
  /** Whether a scope may carry at most one field in this role. */
  readonly single: boolean;
}

export interface RegisteredImageRole extends ImageRoleOptions {
  readonly name: ImageRoleName;
  /** The registering plugin's id, or `null` for core's own roles. */
  readonly registeredBy: string | null;
}

/** Where a role's fields are looked up: one entry type, one taxonomy, or the users. */
export type ImageRoleScope =
  | { readonly kind: "entry"; readonly entryType: string }
  | { readonly kind: "term"; readonly taxonomy: string }
  | { readonly kind: "user" };

/**
 * One field in a role. `path` leads from the meta bag to the stored value: the
 * field's own key at the top level, or the keys of the groups it sits in.
 */
export interface ImageRoleField {
  readonly field: MetaBoxField;
  readonly path: readonly [...string[], string];
}

/** One scope's roles, each with the fields carrying it in declaration order. */
export type ImageRoleScopeIndex = ReadonlyMap<
  string,
  readonly ImageRoleField[]
>;
type ImageRoleIndex = ReadonlyMap<string, ImageRoleScopeIndex>;

const indexes = new WeakMap<PluginRegistry, ImageRoleIndex>();

function scopeKey(scope: ImageRoleScope): string {
  switch (scope.kind) {
    case "entry":
      return `entry:${scope.entryType}`;
    case "term":
      return `term:${scope.taxonomy}`;
    case "user":
      return "user";
  }
}

/**
 * The fields carrying `role` in one scope, in declaration order: box
 * registration order, then field order, depth-first through groups.
 */
export function imageRoleFields(
  registry: PluginRegistry,
  scope: ImageRoleScope,
  role: ImageRoleName,
): readonly ImageRoleField[] {
  return imageRolesInScope(registry, scope).get(role) ?? [];
}

const NO_ROLES: ImageRoleScopeIndex = new Map();

/**
 * Every role one scope carries a field in, with those fields — what a reader
 * projecting all of an entity's images asks for, rather than naming each role.
 */
export function imageRolesInScope(
  registry: PluginRegistry,
  scope: ImageRoleScope,
): ImageRoleScopeIndex {
  // Before boot resolves the index the registry may still grow, so an early
  // query answers from a fresh walk rather than memoising a partial one, and
  // leaves the checks to boot: a role another plugin has yet to register is
  // not an error until every plugin has had its turn.
  const index = indexes.get(registry) ?? buildIndex(registry, false);
  return index.get(scopeKey(scope)) ?? NO_ROLES;
}

/**
 * Build, check and memoise the registry's image-role index. Boot calls it once
 * every plugin has registered — `buildManifest` and `buildApp` both do — so a
 * misdeclared role fails there and requests read the stored index.
 */
export function resolveImageRoleIndex(registry: PluginRegistry): void {
  if (indexes.has(registry)) return;
  indexes.set(registry, buildIndex(registry, true));
}

function buildIndex(
  registry: PluginRegistry,
  checked: boolean,
): ImageRoleIndex {
  const index = new Map<string, Map<string, ImageRoleField[]>>();
  const add = (
    scopes: readonly ImageRoleScope[],
    fields: readonly MetaBoxField[],
  ): void => {
    for (const scope of scopes) {
      const key = scopeKey(scope);
      let byRole = index.get(key);
      if (!byRole) {
        byRole = new Map();
        index.set(key, byRole);
      }
      collect({ registry, checked, scope, byRole }, fields, [], undefined);
    }
  };
  for (const box of registry.entryMetaBoxes.values()) {
    add(
      [...new Set(box.entryTypes)].map((entryType) => ({
        kind: "entry",
        entryType,
      })),
      box.fields,
    );
  }
  for (const box of registry.termMetaBoxes.values()) {
    add(
      [...new Set(box.termTaxonomies)].map((taxonomy) => ({
        kind: "term",
        taxonomy,
      })),
      box.fields,
    );
  }
  for (const box of registry.userMetaBoxes.values()) {
    add([{ kind: "user" }], box.fields);
  }
  return index;
}

interface CollectTarget {
  readonly registry: PluginRegistry;
  readonly checked: boolean;
  readonly scope: ImageRoleScope;
  readonly byRole: Map<string, ImageRoleField[]>;
}

// `repeater` is the path of the outermost repeater above `fields`, if any: a
// role anywhere beneath one would name a row's image, not the entity's.
function collect(
  target: CollectTarget,
  fields: readonly MetaBoxField[],
  parents: readonly string[],
  repeater: string | undefined,
): void {
  for (const field of fields) {
    const path: readonly [...string[], string] = [...parents, field.key];
    if (field.inputType === "group" && "fields" in field) {
      collect(target, field.fields, path, repeater);
      continue;
    }
    if (field.inputType === "repeater" && "subFields" in field) {
      collect(target, field.subFields, path, repeater ?? path.join("."));
      continue;
    }
    if (field.role === undefined) continue;
    const list = target.byRole.get(field.role) ?? [];
    const problem = roleFieldProblem(
      target,
      field,
      field.role,
      path,
      list,
      repeater,
    );
    if (problem) {
      if (target.checked) throw problem;
      continue;
    }
    list.push({ field, path });
    target.byRole.set(field.role, list);
  }
}

function roleFieldProblem(
  target: CollectTarget,
  field: MetaBoxField,
  role: ImageRoleName,
  path: readonly string[],
  earlier: readonly ImageRoleField[],
  repeater: string | undefined,
): PluginDefinitionError | undefined {
  const at = {
    scope: target.scope,
    fieldKey: path.join("."),
    role,
  };
  const registered = target.registry.imageRoles.get(role);
  if (!registered) return PluginDefinitionError.unknownImageRole(at);
  if (repeater !== undefined) {
    return PluginDefinitionError.imageRoleInsideRepeater({
      ...at,
      repeaterKey: repeater,
    });
  }
  if ("referenceTarget" in field && field.referenceTarget.multiple === true) {
    return PluginDefinitionError.roleFieldMustBeSingle(at);
  }
  const [first] = earlier;
  if (first && registered.single) {
    return PluginDefinitionError.singleImageRoleHasMultipleFields({
      scope: target.scope,
      role,
      firstFieldKey: first.path.join("."),
      secondFieldKey: at.fieldKey,
    });
  }
  return undefined;
}
