// TanStack Table's `useReactTable` returns stateful getters that cannot be
// memoized safely — React Compiler detects this automatically and skips
// compilation for this file, emitting a `react-hooks/incompatible-library`
// warning at the call site. No explicit `"use no memo"` directive: it's
// redundant with the compiler's auto-detection and CodeQL flags it as
// unknown. The warning is informational, not an error.

import type { MessageDescriptor } from "@lingui/core";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { useLabel } from "@/lib/use-label.js";
import { cn } from "@/lib/utils.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

const M = {
  loading: defineMessage({
    id: "dataTable.loading",
    message: "Loading",
  }),
} satisfies Record<string, MessageDescriptor>;

// Per-column alignment + className passthrough. Column defs opt in via
// `meta: { className: "text-right" }`; both the header cell and every
// body cell pick up the class so alignment stays in sync.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}
type RowData = unknown;

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  emptyState,
  loadingLabel,
}: {
  readonly columns: ColumnDef<TData>[];
  readonly data: readonly TData[];
  readonly isLoading?: boolean;
  readonly emptyState?: ReactNode;
  /** Screen-reader label for the loading region when `isLoading`.
   *  Defaults to the localized "Loading" descriptor. */
  readonly loadingLabel?: string;
}): ReactNode {
  const label = useLabel();
  const resolvedLoadingLabel = loadingLabel ?? label(M.loading);
  // `useReactTable` returns a non-stable table instance — React Compiler
  // can't memoize the surrounding render. The instance is the documented
  // contract (its methods and state are read by row/cell components)
  // so there's no equivalent subscription-style API to migrate to.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data as TData[],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div
      className="bg-card rounded-md border"
      aria-busy={isLoading || undefined}
      role={isLoading ? "region" : undefined}
      aria-label={isLoading ? resolvedLoadingLabel : undefined}
      data-testid={isLoading ? "data-table-loading" : "data-table"}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  className={cn(header.column.columnDef.meta?.className)}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <DataTableSkeletonRows columns={columns.length} />
          ) : rows.length > 0 ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className="group/row"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(cell.column.columnDef.meta?.className)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-32 text-center"
              >
                {emptyState ?? (
                  <Trans id="dataTable.emptyState" message="No results." />
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DataTableSkeletonRows({ columns }: { columns: number }): ReactNode {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <TableRow key={`skeleton-${String(rowIndex)}`}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <TableCell key={`skeleton-${String(rowIndex)}-${String(colIndex)}`}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
