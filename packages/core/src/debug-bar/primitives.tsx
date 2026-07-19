import type { ReactNode } from "react";
import { Fragment } from "react";

/**
 * Presentational primitives shared by core and plugin debug panels so every
 * panel reads uniformly. Panels may drop to raw markup, but these give them
 * the bar's look for free: `DebugSection` groups a titled block, `DebugKV` is
 * the key/value description list, `DebugTable` a columnar list.
 */

export function DebugSection({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section>
      {title ? (
        <p className="plumix-debug-bar__section-title">{title}</p>
      ) : null}
      {children}
    </section>
  );
}

export interface DebugKVRow {
  readonly label: string;
  readonly value: ReactNode;
}

export function DebugKV({
  rows,
}: {
  readonly rows: readonly DebugKVRow[];
}): ReactNode {
  // A description list is the semantic fit for key/value pairs; a fixed-column
  // grid (in CSS) aligns every value the same distance in across sections.
  return (
    <dl className="plumix-debug-bar__kv">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** A columnar table for list-shaped panel data (queries, spans, candidates). */
export function DebugTable({
  headers,
  rows,
}: {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly ReactNode[])[];
}): ReactNode {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r}>
            {cells.map((cell, c) => (
              <td key={c} className="plumix-debug-bar__val">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
