import type { MessageDescriptor } from "@lingui/core";
import type {
  ColumnDef,
  OnChangeFn,
  RowData,
  RowSelectionState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";
import { cn } from "@/lib/utils.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import {
  flexRender,
  metaHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import { Skeleton } from "@plumix/admin-ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@plumix/admin-ui/table";

const M = {
  loading: defineMessage({
    id: "dataTable.loading",
    message: "Loading",
  }),
} satisfies Record<string, MessageDescriptor>;

// Per-column alignment + className passthrough. Column defs opt in via
// `meta: { className: "text-right" }`; both the header cell and every
// body cell pick up the class so alignment stays in sync.
interface DataTableColumnMeta {
  className?: string;
}

const features = tableFeatures({
  rowSelectionFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

/** Callers use this instead of TanStack's `ColumnDef` so the registered
 *  feature set stays an implementation detail of `DataTable`. */
export type DataTableColumnDef<TData extends RowData> = ColumnDef<
  typeof features,
  TData
>;

export function DataTable<TData extends RowData>({
  columns,
  data,
  isLoading = false,
  emptyState,
  loadingLabel,
  rowSelection,
  onRowSelectionChange,
  getRowId,
}: {
  readonly columns: DataTableColumnDef<TData>[];
  readonly data: readonly TData[];
  readonly isLoading?: boolean;
  readonly emptyState?: ReactNode;
  /** Screen-reader label for the loading region when `isLoading`.
   *  Defaults to the localized "Loading" descriptor. */
  readonly loadingLabel?: string;
  /** Controlled row-selection state. When provided (with
   *  `onRowSelectionChange`), selection is enabled and a selection column
   *  can be added by the caller via `columns`. Keyed by `getRowId`. */
  readonly rowSelection?: RowSelectionState;
  readonly onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  /** Stable per-row id for selection keys (e.g. the entry id) — without
   *  it, selection keys by row index and breaks across refetches. */
  readonly getRowId?: (row: TData) => string;
}): ReactNode {
  const label = useLabel();
  const resolvedLoadingLabel = loadingLabel ?? label(M.loading);
  const selectable = rowSelection !== undefined;
  const table = useTable({
    features,
    data,
    columns,
    ...(selectable
      ? {
          enableRowSelection: true,
          state: { rowSelection },
          onRowSelectionChange,
          ...(getRowId ? { getRowId } : {}),
        }
      : {}),
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
                {/* Not `getVisibleCells` — that comes from
                    `columnVisibilityFeature`, which stays unregistered so
                    cells and `getHeaderGroups` above span the same set. */}
                {row.getAllCells().map((cell) => (
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
