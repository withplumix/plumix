import type { ReactNode } from "react";

import type { AppContext } from "../../context/app.js";
import type { DbQueryEntry } from "../db-query.js";
import type { DebugPanel } from "../types.js";
import { DB_PANEL_ID } from "../db-query.js";
import { describeSqlParam } from "../format-param.js";
import { queryKind, tokenizeSql } from "../highlight-sql.js";
import { DebugSection } from "../primitives.js";

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
 * The Database panel: every query recorded for this request (via the drizzle
 * logger), with SQL syntax highlighting, a per-query kind badge, and the bound
 * params shown separately (typed-colored) — the `?`-form SQL stays copyable.
 * Per-query timing arrives with the Timeline slice.
 */
export const databasePanel: DebugPanel = {
  id: DB_PANEL_ID,
  title: "Database",
  order: 20,
  render: (ctx: AppContext) => {
    const queries = ctx.debug.get(DB_PANEL_ID) as readonly DbQueryEntry[];
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
