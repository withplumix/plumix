import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { SortableList } from "@/components/ui/sortable.js";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

// Multi-value counterpart to `ReferencePicker`. Shares the same
// `kind` / `scope` dispatch shape — same lookup RPC, same adapter
// — but the UX is different: selected rows render as a sortable
// list with drag-reorder + per-row remove, the picker dialog stays
// open across selections (so authors can pick several without
// re-clicking "Add"), and `max` caps the array length both in the
// "Add" button (disables when full) and inside the dialog (no-op
// on item click).

interface MultiReferencePickerProps {
  readonly value: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly kind: string;
  readonly scope?: Record<string, unknown>;
  readonly max?: number;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly label: string;
  readonly testId: string;
}

export function MultiReferencePicker({
  value,
  onChange,
  kind,
  scope,
  max,
  disabled = false,
  required = false,
  label,
  testId,
}: MultiReferencePickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Single batch round-trip to resolve every selected ID. The
  // adapter's `list` honours the `ids` filter and returns one row
  // per live target — orphans simply don't come back. We map by id
  // below so the sortable list still iterates `value` in order.
  // `limit` is omitted: the adapter sizes the result to the parsed-id
  // count for the `ids` path. Spread to drop `readonly` — the wire
  // schema produces a mutable `string[]` and TS won't narrow.
  const resolveQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      input: { kind, scope, ids: [...value] },
    }),
    enabled: value.length > 0,
  });
  const resolvedById = useMemo(() => {
    const map = new Map<
      string,
      { id: string; label: string; subtitle?: string }
    >();
    for (const row of resolveQuery.data?.items ?? []) map.set(row.id, row);
    return map;
  }, [resolveQuery.data]);

  const listQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      input: { kind, query: query.trim() || undefined, scope, limit: 20 },
    }),
    enabled: open,
  });

  const items = listQuery.data?.items ?? [];
  const selectedSet = new Set(value);
  const atMax = max !== undefined && value.length >= max;

  const handlePick = (id: string): void => {
    if (selectedSet.has(id)) return;
    if (atMax) return;
    onChange([...value, id]);
  };

  const handleRemove = (id: string): void => {
    onChange(value.filter((v) => v !== id));
  };

  const handleReorder = (next: readonly { readonly id: string }[]): void => {
    onChange(next.map((row) => row.id));
  };

  // Three states per row: `found` (result in cache), `orphan` (resolve
  // settled, no result — really gone), `pending` (resolve still in
  // flight). The pending case renders as a skeleton so the brief gap
  // between mount and the first resolve doesn't flash "Reference
  // missing" for every row.
  const isResolvePending =
    value.length > 0 &&
    resolveQuery.data === undefined &&
    !resolveQuery.isError;
  const sortableItems = value.map((id) => {
    const result = resolvedById.get(id) ?? null;
    return {
      id,
      result,
      pending: result === null && isResolvePending,
    };
  });

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {resolveQuery.isError ? (
        // Don't conflate "fetch failed" with "every selected id is an
        // orphan" — without this banner, a transient network error
        // would render every row as `Reference missing`.
        <p
          className="text-destructive text-sm"
          data-testid={`${testId}-resolve-error`}
        >
          Couldn&rsquo;t load selected items — refresh to retry.
        </p>
      ) : null}
      {value.length === 0 ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid={`${testId}-empty`}
        >
          None selected
        </p>
      ) : (
        <SortableList
          items={sortableItems}
          onReorder={handleReorder}
          onRemove={required && value.length === 1 ? undefined : handleRemove}
          renderItem={(item) => {
            if (item.result) {
              return (
                <div className="text-sm">
                  <p className="truncate font-medium">{item.result.label}</p>
                  {item.result.subtitle ? (
                    <p className="text-muted-foreground truncate text-xs">
                      {item.result.subtitle}
                    </p>
                  ) : null}
                </div>
              );
            }
            if (item.pending) {
              return (
                <div
                  className="flex flex-col gap-1.5"
                  data-testid={`${testId}-resolving-${item.id}`}
                  aria-busy="true"
                >
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              );
            }
            return (
              <p
                className="text-destructive text-sm"
                data-testid={`${testId}-orphan-${item.id}`}
              >
                Reference missing — remove or re-pick
              </p>
            );
          }}
          disabled={disabled}
          testId={`${testId}-list`}
        />
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || atMax}
          onClick={() => {
            setQuery("");
            setOpen(true);
          }}
          data-testid={`${testId}-add`}
        >
          {value.length === 0 ? "Select" : "Add"}
        </Button>
        {max !== undefined ? (
          <span
            className="text-muted-foreground text-xs"
            data-testid={`${testId}-count`}
          >
            {value.length} / {max}
          </span>
        ) : null}
      </div>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={`Search and pick ${kind} entries`}
      >
        <CommandInput
          placeholder={`Search ${kind}…`}
          value={query}
          onValueChange={setQuery}
          data-testid={`${testId}-search`}
        />
        <CommandList>
          {listQuery.isLoading ? (
            <CommandEmpty>Loading…</CommandEmpty>
          ) : items.length === 0 ? (
            <CommandEmpty>No matches</CommandEmpty>
          ) : (
            items.map((item) => {
              const alreadySelected = selectedSet.has(item.id);
              return (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.subtitle ?? ""}`}
                  disabled={alreadySelected || atMax}
                  onSelect={() => {
                    handlePick(item.id);
                  }}
                  data-testid={`${testId}-option-${item.id}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {item.label}
                      {alreadySelected ? " ✓" : ""}
                    </span>
                    {item.subtitle ? (
                      <span className="text-muted-foreground text-xs">
                        {item.subtitle}
                      </span>
                    ) : null}
                  </div>
                </CommandItem>
              );
            })
          )}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
