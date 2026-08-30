import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { SQL } from "../db/index.js";
import type { SearchTerm } from "../rpc/procedures/entry/search-terms.js";
import { not, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { terms } from "../db/schema/terms.js";
import { users } from "../db/schema/users.js";
import { escapeLikePattern } from "../rpc/procedures/entry/search-terms.js";

/**
 * `entries.content` is deliberately absent. It holds the block envelope, whose
 * keys, block names and attribute names read as prose to a substring match, so
 * matching it returned most of the table for `image`, `text`, `code` and a
 * dozen other structural words (#2117).
 */
export function entrySearchCondition(term: SearchTerm): SQL {
  return likeAcross(term, [entries.title, entries.excerpt]);
}

export function termSearchCondition(term: SearchTerm): SQL {
  return likeAcross(term, [terms.name, terms.slug]);
}

export function userSearchCondition(term: SearchTerm): SQL {
  return likeAcross(term, [users.name, users.email]);
}

// COALESCE is what keeps the excluded (`-term`) branch honest: `null LIKE ?` is
// null, and `NOT (null)` is null, so a row with no excerpt would drop out of a
// result set it belongs in.
function likeAcross(
  term: SearchTerm,
  columns: readonly AnySQLiteColumn[],
): SQL {
  const pattern = `%${escapeLikePattern(term.value)}%`;
  const match = sql`(${sql.join(
    columns.map(
      (column) => sql`COALESCE(${column}, '') LIKE ${pattern} ESCAPE '\\'`,
    ),
    sql` OR `,
  )})`;
  return term.exclude ? not(match) : match;
}
