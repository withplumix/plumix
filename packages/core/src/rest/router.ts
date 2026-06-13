import type { ORPCErrorConstructorMap } from "@orpc/server";

import type { REST_ERRORS } from "./errors.js";
import { EntryReadError } from "../entries/errors.js";
import { getEntry, listEntries } from "../entries/read-service.js";
import { base } from "./base.js";
import { listEnvelope } from "./envelope.js";
import { loadPublicAuthors, projectEntry } from "./projection.js";
import { resolvePublicEntryType } from "./rest-base.js";
import {
  entriesListEnvelopeSchema,
  entryCollectionParamsSchema,
  entryItemParamsSchema,
  publicEntrySchema,
  readPagination,
} from "./schemas.js";

type RestErrors = ORPCErrorConstructorMap<typeof REST_ERRORS>;

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

// GET /{type} — a paginated envelope of published entries for any public
// content type, resolved from the registry at request time so custom types
// light up automatically.
const listEntriesResource = base
  .route({ method: "GET", path: "/{type}" })
  .input(entryCollectionParamsSchema)
  .output(entriesListEnvelopeSchema)
  .handler(async ({ input, context, errors }) => {
    const entryType = resolvePublicEntryType(context.plugins, input.type);
    if (!entryType) throw errors.NOT_FOUND({ data: { kind: "collection" } });

    const url = new URL(context.request.url);
    const { page, perPage, offset } = readPagination(url);

    // Over-fetch one row to detect a next page without a separate COUNT — an
    // exact-multiple last page then reports no next link.
    const fetched = await listEntries(context, {
      type: entryType.name,
      orderBy: "published_at",
      order: "desc",
      limit: perPage + 1,
      offset,
    });
    const hasNext = fetched.length > perPage;
    const rows = hasNext ? fetched.slice(0, perPage) : fetched;

    const authors = await loadPublicAuthors(
      context,
      rows.map((row) => row.authorId),
    );
    const data = rows.map((row) =>
      projectEntry(row, authors.get(row.authorId) ?? null),
    );

    return listEnvelope(data, { url, page, perPage, hasNext });
  });

// GET /{type}/{id} — one published entry. Unviewable or missing content is
// 404, never 403.
const getEntryResource = base
  .route({ method: "GET", path: "/{type}/{id}" })
  .input(entryItemParamsSchema)
  .output(publicEntrySchema)
  .handler(async ({ input, context, errors }) => {
    const entryType = resolvePublicEntryType(context.plugins, input.type);
    if (!entryType) throw errors.NOT_FOUND({ data: { kind: "collection" } });

    const id = Number(input.id);
    if (!Number.isInteger(id) || id < 1) {
      throw errors.NOT_FOUND({ data: { kind: "entry" } });
    }

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
    return projectEntry(entry, authors.get(entry.authorId) ?? null);
  });

export const restRouter = {
  entriesList: listEntriesResource,
  entriesGet: getEntryResource,
};
