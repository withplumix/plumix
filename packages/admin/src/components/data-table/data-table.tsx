// TanStack Table's `useReactTable` returns stateful getters that cannot be
// memoized safely — React Compiler detects this automatically and skips
// compilation for this file, emitting a `react-hooks/incompatible-library`
// warning at the call site. No explicit `"use no memo"` directive: it's
// redundant with the compiler's auto-detection and CodeQL flags it as
// unknown. The warning is informational, not an error.

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
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  emptyState,
  loadingLabel = "Loading",
}: {
  readonly columns: ColumnDef<TData>[];
  readonly data: readonly TData[];
  readonly isLoading?: boolean;
  readonly emptyState?: ReactNode;
  /** Screen-reader label for the loading region when `isLoading`. */
  readonly loadingLabel?: string;
}): ReactNode {
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
      aria-label={isLoading ? loadingLabel : undefined}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
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
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
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
                {emptyState ?? "No results."}
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
