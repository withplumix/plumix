import type { AppContext } from "../context/app.js";
import type { RegisteredEntryType } from "../plugin/manifest.js";
import type { RestErrors } from "./errors.js";
import type { PublicEntry } from "./schemas.js";
import { EntryReadError } from "../entries/errors.js";
import { getEntry, listEntries } from "../entries/read-service.js";
import { listEnvelope } from "./envelope.js";
import {
  apiVisibleMetaKeys,
  loadEntriesTerms,
  loadPublicAuthors,
  projectEntry,
} from "./projection.js";
import { readPagination } from "./schemas.js";

// Every entry-read failure mode (missing, reserved-type, forbidden, an
// unpublished status the public principal can't see) collapses to 404 so the
// existence of unreadable content stays hidden. A non-EntryReadError is
// unexpected and rethrown for the dispatcher to surface as a 500.
function entryNotFound(error: unknown, errors: RestErrors): unknown {
  if (error instanceof EntryReadError) {
    return errors.NOT_FOUND({ data: { kind: "entry" } });
  }
  return error;
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
    if (taxonomy.isPublic === false) continue;
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

// A paginated envelope of published entries for a public content type.
export async function listEntriesEnvelope(
  context: AppContext,
  entryType: RegisteredEntryType,
  url: URL,
) {
  const { page, perPage, offset } = readPagination(url);

  // Over-fetch one row to detect a next page without a separate COUNT — an
  // exact-multiple last page then reports no next link.
  const fetched = await listEntries(context, {
    type: entryType.name,
    orderBy: "published_at",
    order: "desc",
    termTaxonomies: readTermFilters(context, url),
    limit: perPage + 1,
    offset,
  });
  const hasNext = fetched.length > perPage;
  const rows = hasNext ? fetched.slice(0, perPage) : fetched;

  const ids = rows.map((row) => row.id);
  const authors = await loadPublicAuthors(
    context,
    rows.map((row) => row.authorId),
  );
  const termsByEntry = await loadEntriesTerms(context, ids);
  const visibleMeta = apiVisibleMetaKeys(context.plugins, entryType.name);
  const data = rows.map((row) =>
    projectEntry(
      row,
      authors.get(row.authorId) ?? null,
      termsByEntry.get(row.id) ?? {},
      visibleMeta,
    ),
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
  let entry: Awaited<ReturnType<typeof getEntry>>;
  try {
    entry = await getEntry(context, { id });
  } catch (error) {
    throw entryNotFound(error, errors);
  }

  // The id resolved to an entry of a different collection — hide that it
  // exists rather than redirecting or 400ing.
  if (entry.type !== entryType.name) {
    throw errors.NOT_FOUND({ data: { kind: "entry" } });
  }
  const authors = await loadPublicAuthors(context, [entry.authorId]);
  const termsByEntry = await loadEntriesTerms(context, [entry.id]);
  const visibleMeta = apiVisibleMetaKeys(context.plugins, entryType.name);
  return projectEntry(
    entry,
    authors.get(entry.authorId) ?? null,
    termsByEntry.get(entry.id) ?? {},
    visibleMeta,
  );
}
