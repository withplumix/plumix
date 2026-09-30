import type { AppContext } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type { RegisteredEntryType } from "../plugin/manifest.js";
import type { RestErrors } from "./contract/errors.js";
import type { PublicEntry } from "./schemas.js";
import { EntryReadError } from "../entries/errors.js";
import { findReadableEntry, listEntryRows } from "../entries/read-service.js";
import { resolveEntryList } from "../route/render/resolve-entry-list.js";
import { listEnvelope } from "./envelope.js";
import { apiVisibleMetaKeys, projectEntry } from "./projection.js";
import { readPagination } from "./schemas.js";

// Every entry-read failure mode (missing, reserved-type, forbidden, an
// unpublished status the public principal can't see) collapses to 404 so the
// existence of unreadable content stays hidden. `undefined` for a
// non-EntryReadError, which is unexpected: the caller rethrows it for the
// dispatcher to surface as a 500.
export function entryNotFound(
  error: unknown,
  errors: RestErrors,
): Error | undefined {
  if (error instanceof EntryReadError) {
    return errors.NOT_FOUND({ data: { kind: "entry" } });
  }
  return undefined;
}

// Pagination params own these query keys; a taxonomy that happens to share a
// name with one is skipped as a filter so `?page=2` can't double as a term query.
const RESERVED_QUERY_PARAMS = new Set(["page", "per_page"]);

// Map `?<taxonomy>=slug,slug` query params onto the service's term filter. Only
// registered public taxonomies are honored, so any other query key is ignored.
function readTermFilters(
  context: AppContext,
  url: URL,
): Record<string, string[]> | undefined {
  const filters: Record<string, string[]> = {};
  for (const taxonomy of context.plugins.termTaxonomies.values()) {
    if (!taxonomy.isPublic) continue;
    if (RESERVED_QUERY_PARAMS.has(taxonomy.name)) continue;
    const slugs = url.searchParams
      .getAll(taxonomy.name)
      .flatMap((value) => value.split(","))
      .map((slug) => slug.trim())
      .filter(Boolean);
    if (slugs.length > 0) filters[taxonomy.name] = slugs;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

// A paginated envelope of a public content type's entries: published ones,
// plus whatever unpublished rows the caller's own token may see.
export async function listEntriesEnvelope(
  context: AppContext,
  entryType: RegisteredEntryType,
  url: URL,
) {
  const { page, perPage, offset } = readPagination(url);

  // Over-fetch one row to detect a next page without a separate COUNT — an
  // exact-multiple last page then reports no next link.
  const fetched = await listEntryRows(context, {
    type: entryType.name,
    orderBy: "published_at",
    order: "desc",
    termTaxonomies: readTermFilters(context, url),
    limit: perPage + 1,
    offset,
  });
  const hasNext = fetched.length > perPage;
  const rows = hasNext ? fetched.slice(0, perPage) : fetched;

  // The same resolution a public page gets, so a title reads as it does
  // there. It replaces the resource's own author and term reads: one batch
  // of each for the page.
  const resolved = await resolveEntryList(context, rows);
  const visibleMeta = apiVisibleMetaKeys(context.plugins, entryType.name);
  const data = resolved.map((entry) =>
    projectEntry(context.plugins, entry, visibleMeta),
  );

  return listEnvelope(data, { url, page, perPage, hasNext });
}

// One published entry. Unviewable or missing content is 404, never 403.
export async function getEntryItem(
  context: AppContext,
  entryType: RegisteredEntryType,
  id: number,
  errors: RestErrors,
): Promise<PublicEntry> {
  let row: Entry;
  try {
    row = await findReadableEntry(context, { id });
  } catch (error) {
    throw entryNotFound(error, errors) ?? error;
  }

  // The id resolved to an entry of a different collection — hide that it
  // exists rather than redirecting or 400ing.
  if (row.type !== entryType.name) {
    throw errors.NOT_FOUND({ data: { kind: "entry" } });
  }
  const [entry] = await resolveEntryList(context, [row]);
  if (!entry) throw errors.NOT_FOUND({ data: { kind: "entry" } });
  const visibleMeta = apiVisibleMetaKeys(context.plugins, entryType.name);
  return projectEntry(context.plugins, entry, visibleMeta);
}
