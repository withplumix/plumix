import type { AppContext } from "../context/app.js";
import type { SQL } from "../db/index.js";
import type { SearchTerm } from "../rpc/procedures/entry/search-terms.js";
import type {
  AdminSearchInput,
  SearchGroup,
  SearchResultItem,
} from "./admin-search.js";
import { and, asc, inArray, not, sql } from "../db/index.js";
import { terms } from "../db/schema/terms.js";
import {
  escapeLikePattern,
  tokenizeSearchQuery,
} from "../rpc/procedures/entry/search-terms.js";
import { taxonomyCapability } from "../rpc/procedures/term/helpers.js";

// Max rows scanned across all taxonomies for one query; bucketed per
// group afterward. Terms carry no draft/trash status — visibility is
// just the per-taxonomy read capability.
const SCAN_LIMIT = 50;
// Group priority base, after the entries domain (10..) so Content sorts
// above Terms in the palette.
const PRIORITY_BASE = 100;

/**
 * `admin:search:results` handler for the `terms` domain. Matches
 * name+slug (LIKE) across every taxonomy the caller can read, in a single
 * query, and returns one group per taxonomy.
 */
export async function termsSearchHandler(
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  const tokens = tokenizeSearchQuery(input.query);
  if (tokens.length === 0) return [];

  const readable = [...ctx.plugins.termTaxonomies.entries()].filter(([name]) =>
    ctx.auth.can(taxonomyCapability(name, "read")),
  );
  if (readable.length === 0) return [];

  const rows = await ctx.db
    .select({ id: terms.id, taxonomy: terms.taxonomy, name: terms.name })
    .from(terms)
    .where(
      and(
        inArray(
          terms.taxonomy,
          readable.map(([name]) => name),
        ),
        ...tokens.map(nameSlugCondition),
      ),
    )
    .orderBy(asc(terms.name))
    .limit(SCAN_LIMIT);

  const byTaxonomy = new Map<string, SearchResultItem[]>();
  for (const row of rows) {
    const items = byTaxonomy.get(row.taxonomy) ?? [];
    if (items.length >= input.limit) continue;
    items.push({ id: String(row.id), title: row.name });
    byTaxonomy.set(row.taxonomy, items);
  }

  const groups: SearchGroup[] = [];
  let priority = PRIORITY_BASE;
  for (const [name, spec] of readable) {
    const items = byTaxonomy.get(name);
    if (!items || items.length === 0) continue;
    groups.push({
      key: `term:${name}`,
      label: spec.labels?.plural ?? spec.label,
      priority: priority++,
      items,
    });
  }
  return groups;
}

function nameSlugCondition(term: SearchTerm): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  const match = sql`(
    ${terms.name} LIKE ${pattern} ESCAPE '\\'
    OR ${terms.slug} LIKE ${pattern} ESCAPE '\\'
  )`;
  return term.exclude ? not(match) : match;
}
