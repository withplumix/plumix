import type { ReactNode } from "react";

/**
 * Presentational primitives shared by core and plugin debug panels so every
 * panel reads uniformly. `DebugKV` is the two-column key/value table the
 * scalar panels use; richer primitives (sections, columnar tables) arrive
 * with the panels that need them.
 */

export interface DebugKVRow {
  readonly label: string;
  readonly value: ReactNode;
}

export function DebugKV({
  rows,
}: {
  readonly rows: readonly DebugKVRow[];
}): ReactNode {
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td className="plumix-debug-bar__val">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
