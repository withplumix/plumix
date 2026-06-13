import type {
  PluginRegistry,
  RegisteredEntryType,
  RegisteredTermTaxonomy,
} from "../plugin/manifest.js";

// Naive pluralization; an explicit per-type rest_base override is a later concern.
function pluralize(name: string): string {
  if (name.endsWith("y") && !/[aeiou]y$/.test(name)) {
    return `${name.slice(0, -1)}ies`;
  }
  if (/(?:s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

/**
 * Resolve a collection rest_base (e.g. `posts`) to its registered public entry
 * type. Non-public and unknown bases resolve to null so the caller can 404 —
 * the existence of a non-public type stays hidden.
 */
export function resolvePublicEntryType(
  registry: PluginRegistry,
  restBase: string,
): RegisteredEntryType | null {
  for (const type of registry.entryTypes.values()) {
    if (type.isPublic !== false && pluralize(type.name) === restBase) {
      return type;
    }
  }
  return null;
}

/**
 * Resolve a collection rest_base (e.g. `categories`) to its registered public
 * taxonomy. Entry types and taxonomies share the top-level rest_base namespace
 * (siblings, as in WordPress), so the dispatcher tries this after entry types.
 */
export function resolvePublicTaxonomy(
  registry: PluginRegistry,
  restBase: string,
): RegisteredTermTaxonomy | null {
  for (const taxonomy of registry.termTaxonomies.values()) {
    if (taxonomy.isPublic !== false && pluralize(taxonomy.name) === restBase) {
      return taxonomy;
    }
  }
  return null;
}
