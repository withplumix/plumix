import type { Term } from "../db/schema/terms.js";
import type { ResolvedMeta } from "../meta/contract/bags.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { ResolvedEntry } from "../route/contract/resolved-entry.js";
import type { PublicEntry, PublicTerm } from "./schemas.js";
import { projectImageRoles } from "../images/role-images.js";

export function projectTerm(
  term: Pick<Term, "id" | "name" | "slug">,
): PublicTerm {
  return { id: term.id, name: term.name, slug: term.slug };
}

/**
 * Default-deny: only fields registered with `showInApi`, so adding a field
 * can't leak it.
 */
export function apiVisibleMetaKeys(
  registry: PluginRegistry,
  entryType: string,
): Set<string> {
  const keys = new Set<string>();
  for (const box of registry.entryMetaBoxes.values()) {
    if (!box.entryTypes.includes(entryType)) continue;
    for (const field of box.fields) {
      if (field.showInApi === true) keys.add(field.key);
    }
  }
  return keys;
}

function projectMeta(
  bag: ResolvedMeta,
  visibleKeys: Set<string>,
): ResolvedMeta {
  const out: Record<string, unknown> = {};
  for (const key of visibleKeys) {
    if (key in bag) out[key] = bag[key];
  }
  return out;
}

/**
 * An explicit allowlist, so a new entries column never leaks. `title` carries
 * the same shortcode expansion a public page renders.
 */
export function projectEntry(
  registry: PluginRegistry,
  entry: ResolvedEntry,
  visibleMetaKeys: Set<string>,
): PublicEntry {
  return {
    id: entry.id,
    type: entry.type,
    slug: entry.slug,
    title: entry.title,
    excerpt: entry.excerpt,
    content: entry.content,
    status: entry.status,
    publishedAt: entry.publishedAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    author: {
      id: entry.author.id,
      name: entry.author.name,
      avatarUrl: entry.author.avatarUrl,
    },
    terms: projectEntryTerms(registry, entry.terms),
    meta: projectMeta(entry.meta, visibleMetaKeys),
    images: projectApiImages(registry, entry),
  };
}

/**
 * Grouped by taxonomy, keeping the resolver's `entry_term.sortOrder` order.
 * Terms in non-public taxonomies are dropped (default-deny).
 */
function projectEntryTerms(
  registry: PluginRegistry,
  terms: ResolvedEntry["terms"],
): Record<string, PublicTerm[]> {
  const grouped: Record<string, PublicTerm[]> = {};
  for (const term of terms) {
    if (registry.termTaxonomies.get(term.taxonomy)?.isPublic === false) {
      continue;
    }
    (grouped[term.taxonomy] ??= []).push(projectTerm(term));
  }
  return grouped;
}

/** `?? null` only satisfies the optional type of `RoleImages`. */
function projectApiImages(
  registry: PluginRegistry,
  entry: ResolvedEntry,
): PublicEntry["images"] {
  const images: PublicEntry["images"] = {};
  const projected = projectImageRoles(
    registry,
    { kind: "entry", entryType: entry.type },
    entry.meta,
    { include: (field) => field.showInApi === true },
  );
  for (const [role, image] of Object.entries(projected)) {
    images[role] = image ?? null;
  }
  return images;
}
