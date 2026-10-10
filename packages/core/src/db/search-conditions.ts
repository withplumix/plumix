import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import type { SearchTerm } from "../search/contract/search-terms.js";
import type { SQL } from "./index.js";
import { escapeLikePattern } from "../search/contract/search-terms.js";
import { not, sql } from "./index.js";
import { entries } from "./schema/entries.js";
import { terms } from "./schema/terms.js";
import { users } from "./schema/users.js";

/**
 * Skips `entries.content`: block names and attribute keys read as prose, so
 * structural words like `image` matched most of the table.
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

/**
 * COALESCE: `NOT (null LIKE ?)` is null, which would drop a row with no
 * excerpt from the excluded branch.
 */
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
