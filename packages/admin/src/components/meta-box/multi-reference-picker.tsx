import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.js";
import { SortableList } from "@/components/ui/sortable.js";
import { orpc } from "@/lib/orpc.js";
import { useQueries, useQuery } from "@tanstack/react-query";

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

  // Resolve every selected ID in parallel. `useQueries` keeps each
  // resolution independent so a single missing target shows up as
  // an orphan row without poisoning its neighbours.
  const resolved = useQueries({
    queries: value.map((id) =>
      orpc.lookup.resolve.queryOptions({ input: { kind, id, scope } }),
    ),
  });

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

  const sortableItems = value.map((id, index) => {
    const result = resolved[index]?.data?.result ?? null;
    return { id, result };
  });

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
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
          renderItem={(item) =>
            item.result ? (
              <div className="text-sm">
                <p className="truncate font-medium">{item.result.label}</p>
                {item.result.subtitle ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {item.result.subtitle}
                  </p>
                ) : null}
              </div>
            ) : (
              <p
                className="text-destructive text-sm"
                data-testid={`${testId}-orphan-${item.id}`}
              >
                Reference missing — remove or re-pick
              </p>
            )
          }
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
