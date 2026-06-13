import * as v from "valibot";

import { base } from "./base.js";
import { getEntryItem, listEntriesEnvelope } from "./entries-resource.js";
import { resolvePublicEntryType, resolvePublicTaxonomy } from "./rest-base.js";
import {
  collectionItemParamsSchema,
  collectionParamsSchema,
  entriesListEnvelopeSchema,
  publicEntrySchema,
  publicTermSchema,
  termsListEnvelopeSchema,
} from "./schemas.js";
import { getTermItem, listTermsEnvelope } from "./terms-resource.js";

// Entry types and taxonomies are siblings in the top-level `{collection}`
// rest_base namespace (as in WordPress), so a single pair of routes resolves
// the rest_base to whichever registry owns it; an unowned base is 404.

// GET /{collection} — a paginated envelope of a public entry type or taxonomy.
const collectionList = base
  .route({ method: "GET", path: "/{collection}" })
  .input(collectionParamsSchema)
  .output(v.union([entriesListEnvelopeSchema, termsListEnvelopeSchema]))
  .handler(async ({ input, context, errors }) => {
    const url = new URL(context.request.url);
    const entryType = resolvePublicEntryType(context.plugins, input.collection);
    if (entryType) return listEntriesEnvelope(context, entryType, url);
    const taxonomy = resolvePublicTaxonomy(context.plugins, input.collection);
    if (taxonomy) return listTermsEnvelope(context, taxonomy, url);
    throw errors.NOT_FOUND({ data: { kind: "collection" } });
  });

// GET /{collection}/{id} — one entry or term. Missing/unviewable items 404.
const collectionGet = base
  .route({ method: "GET", path: "/{collection}/{id}" })
  .input(collectionItemParamsSchema)
  .output(v.union([publicEntrySchema, publicTermSchema]))
  .handler(async ({ input, context, errors }) => {
    const id = Number(input.id);
    if (!Number.isInteger(id) || id < 1) {
      throw errors.NOT_FOUND({ data: { kind: "item" } });
    }
    const entryType = resolvePublicEntryType(context.plugins, input.collection);
    if (entryType) return getEntryItem(context, entryType, id, errors);
    const taxonomy = resolvePublicTaxonomy(context.plugins, input.collection);
    if (taxonomy) return getTermItem(context, taxonomy, id, errors);
    throw errors.NOT_FOUND({ data: { kind: "collection" } });
  });

export const restRouter = {
  collectionList,
  collectionGet,
};
