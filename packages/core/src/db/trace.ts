import type { JsonValue, TelemetrySpanHandle } from "../context/telemetry.js";
import { tryGetContext } from "../context/stores.js";
import { queryKind } from "./query-kind.js";

/** One statement as the driver wrap sees it: `?`-form SQL plus bound params. */
export interface TracedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

// Bound params may carry driver values (blobs, bigints, dates) that a
// JSON-serializable snapshot can't hold; degrade those to short descriptions.
function jsonParam(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return `<blob ${value.byteLength} bytes>`;
  }
  return `<${typeof value}>`;
}

function dbSpan<T>(
  name: string,
  setAttributes: (s: TelemetrySpanHandle) => void,
  run: () => Promise<T>,
  countRows: (result: T) => number,
): Promise<T> {
  const ctx = tryGetContext();
  if (!ctx) return run();
  return ctx.telemetry.span(name, (s) => {
    setAttributes(s);
    return run().then((result) => {
      s.set("db.rows", countRows(result));
      return result;
    });
  });
}

/**
 * Times one driver-level query as a `db: <kind>` span with the SQL, bound
 * params, and row count as attributes — the single mechanism behind every
 * `ctx.db` driver wrap (libsql, D1, demo proxy). A no-op outside a request;
 * with an inactive collector the span passes through and the lazy params are
 * never serialized. `countRows` reads the driver's result shape: rows
 * returned, or rows affected for a write.
 */
export function traceDbQuery<T>(
  query: TracedQuery,
  run: () => Promise<T>,
  countRows: (result: T) => number,
): Promise<T> {
  return dbSpan(
    `db: ${queryKind(query.sql)}`,
    (s) => {
      s.set("db.sql", query.sql);
      if (query.params.length > 0) {
        s.set("db.params", () => query.params.map(jsonParam));
      }
    },
    run,
    countRows,
  );
}

/**
 * Times a driver-level batch — one round-trip, so one span (labelled by kind
 * when uniform, `db: batch` otherwise), with the per-statement sql/params under
 * a `db.batch` attribute and the summed row count.
 */
export function traceDbBatch<T>(
  queries: readonly TracedQuery[],
  run: () => Promise<T>,
  countRows: (result: T) => number,
): Promise<T> {
  const kinds = new Set(queries.map((query) => queryKind(query.sql)));
  const kind = kinds.size === 1 ? [...kinds][0] : "batch";
  return dbSpan(
    `db: ${kind} (${queries.length})`,
    (s) => {
      s.set("db.batch", () =>
        queries.map((query) => ({
          sql: query.sql,
          params: query.params.map(jsonParam),
        })),
      );
    },
    run,
    countRows,
  );
}
