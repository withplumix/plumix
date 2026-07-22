import type { ReactNode } from "react";

import type { AppContext } from "../../context/app.js";
import type { JsonValue, TelemetrySpan } from "../../context/telemetry.js";
import type { DebugPanel } from "../types.js";
import { queryKind } from "../../db/query-kind.js";
import { describeSqlParam } from "../format-param.js";
import { tokenizeSql } from "../highlight-sql.js";
import { DebugSection } from "../primitives.js";

/** Panel id, also the disable-denylist key and tab testid suffix. */
export const DB_PANEL_ID = "database";

interface QueryRow {
  readonly sql: string;
  readonly params: readonly unknown[];
  /** Absent for statements inside a batch — the round-trip is timed, not each. */
  readonly durationMs?: number;
}

function asParams(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

// `Array.isArray` narrows a readonly-array union to `any[]`; a dedicated
// guard keeps the elements typed as JsonValue.
function isJsonArray(
  value: JsonValue | undefined,
): value is readonly JsonValue[] {
  return Array.isArray(value);
}

// Walks the span tree collecting what the driver wraps emit: a `db.sql` span
// is one query row; a `db.batch` span flattens into one row per statement.
function collectQueryRows(spans: readonly TelemetrySpan[]): QueryRow[] {
  const rows: QueryRow[] = [];
  const visit = (span: TelemetrySpan): void => {
    const {
      "db.sql": sql,
      "db.params": params,
      "db.batch": batch,
    } = span.attributes;
    if (typeof sql === "string") {
      rows.push({ sql, params: asParams(params), durationMs: span.durationMs });
    } else if (isJsonArray(batch)) {
      for (const stmt of batch) {
        if (typeof stmt !== "object" || stmt === null || isJsonArray(stmt)) {
          continue;
        }
        if (typeof stmt.sql !== "string") continue;
        rows.push({ sql: stmt.sql, params: asParams(stmt.params) });
      }
    }
    for (const child of span.children) visit(child);
  };
  for (const span of spans) visit(span);
  return rows;
}

function HighlightedSql({ sql }: { readonly sql: string }): ReactNode {
  return (
    <code className="plumix-debug-bar__sql">
      {tokenizeSql(sql).map((token, i) =>
        token.kind === "text" ? (
          token.text
        ) : (
          <span key={i} className={`plumix-debug-bar__tok--${token.kind}`}>
            {token.text}
          </span>
        ),
      )}
    </code>
  );
}

/**
 * The Database panel: every query span this request's driver wrap emitted,
 * with SQL syntax highlighting, a per-query kind badge, per-query duration,
 * and the bound params shown separately (typed-colored) — the `?`-form SQL
 * stays copyable.
 */
export const databasePanel: DebugPanel = {
  id: DB_PANEL_ID,
  title: "Database",
  order: 20,
  render: (ctx: AppContext) => {
    const queries = collectQueryRows(ctx.telemetry.getSpans());
    if (queries.length === 0) {
      return <p className="plumix-debug-bar__empty">No queries recorded.</p>;
    }
    return (
      <DebugSection
        title={`${queries.length} ${queries.length === 1 ? "query" : "queries"}`}
      >
        <ol className="plumix-debug-bar__queries">
          {queries.map((query, i) => {
            const kind = queryKind(query.sql);
            return (
              <li key={i} className="plumix-debug-bar__query">
                <div className="plumix-debug-bar__query-head">
                  <span
                    className={`plumix-debug-bar__kind plumix-debug-bar__kind--${kind}`}
                  >
                    {kind}
                  </span>
                  <HighlightedSql sql={query.sql} />
                  {query.durationMs !== undefined ? (
                    <span className="plumix-debug-bar__query-ms">
                      {query.durationMs}ms
                    </span>
                  ) : null}
                </div>
                {query.params.length > 0 ? (
                  <div className="plumix-debug-bar__params">
                    {query.params.map((param, j) => {
                      const { kind: paramKind, text } = describeSqlParam(param);
                      return (
                        <span
                          key={j}
                          className={`plumix-debug-bar__param plumix-debug-bar__param--${paramKind}`}
                        >
                          {text}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </DebugSection>
    );
  },
};
