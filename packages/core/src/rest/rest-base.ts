import type {
  PluginRegistry,
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "../plugin/manifest.js";

/**
 * Naive pluralization; an explicit per-type rest_base override is a later
 * concern.
 */
function pluralize(name: string): string {
  if (name.endsWith("y") && !/[aeiou]y$/.test(name)) {
    return `${name.slice(0, -1)}ies`;
  }
  if (/(?:s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

/**
 * Null for non-public and unknown bases alike, so a non-public type's existence
 * stays hidden.
 */
export function resolvePublicEntryType(
  registry: PluginRegistry,
  restBase: string,
): RegisteredEntryType | null {
  for (const type of registry.entryTypes.values()) {
    if (type.isPublic && pluralize(type.name) === restBase) {
      return type;
    }
  }
  return null;
}

/**
 * Entry types and taxonomies share the rest_base namespace, so try this after
 * entry types.
 */
export function resolvePublicTaxonomy(
  registry: PluginRegistry,
  restBase: string,
): RegisteredTermTaxonomy | null {
  for (const taxonomy of registry.termTaxonomies.values()) {
    if (taxonomy.isPublic && pluralize(taxonomy.name) === restBase) {
      return taxonomy;
    }
  }
  return null;
}
