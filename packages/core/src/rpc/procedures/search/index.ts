import * as v from "valibot";

import { runAdminSearch } from "../../../search/admin-search.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";

const DEFAULT_LIMIT = 5;

const searchInputSchema = v.object({
  query: v.pipe(v.string(), v.trim(), v.maxLength(200)),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
  ),
});

/**
 * Cross-domain admin search for the command palette. Fans out across the
 * registered `admin:search:results` domains (entries, terms, users, and
 * plugin-contributed ones) and returns grouped results. Each domain
 * enforces its own capabilities server-side.
 */
const query = base
  .use(authenticated)
  .input(searchInputSchema)
  .handler(async ({ input, context }) => {
    if (input.query.length === 0) return [];
    return runAdminSearch(
      context.hooks,
      { query: input.query, limit: input.limit ?? DEFAULT_LIMIT },
      context,
    );
  });

export const searchRouter = { query } as const;
