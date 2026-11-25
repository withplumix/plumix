import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** Not JSON: column encoders accept native values such as Date. */
type ColumnChanges = Record<string, unknown>;

/** Calculate the timestamp in the UPDATE so RETURNING sees the new value. */
export function contentTimestamp(
  timestamp: SQLiteColumn,
  columns: Record<string, SQLiteColumn>,
  changes: ColumnChanges,
  next: SQL,
): SQL {
  const equal = Object.entries(changes).flatMap(([key, value]) => {
    const column = columns[key];
    if (!column || value === undefined) return [];
    return [sql`${column} is ${sql.param(value, column)}`];
  });
  if (equal.length === 0) return sql`${timestamp}`;
  return sql`case when ${sql.join(equal, sql` and `)} then ${timestamp} else ${next} end`;
}
