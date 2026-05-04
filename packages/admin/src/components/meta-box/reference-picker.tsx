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
import { Skeleton } from "@/components/ui/skeleton.js";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";

// Generic picker for reference fields (`user`, future `entry` /
// `term` / `media`). The field's `referenceTarget.kind` selects the
// adapter; `referenceTarget.scope` rides through to the lookup RPC
// untouched. Same component, same UX, regardless of target.
//
// Storage is the bare ID string; the picker's job is to swap the
// admin-side display from "42" to a human-readable label without
// changing what the form submits.

interface ReferencePickerProps {
  readonly value: string | null;
  readonly onChange: (next: string | null) => void;
  readonly kind: string;
  readonly scope?: Record<string, unknown>;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly label: string;
  readonly testId: string;
}

export function ReferencePicker({
  value,
  onChange,
  kind,
  scope,
  disabled = false,
  required = false,
  label,
  testId,
}: ReferencePickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Resolve the currently-selected id to its label/subtitle. Skips
  // when value is null. Stale-data tolerant — if the target was
  // deleted server-side, `result` comes back null and we render a
  // "Missing" badge so the author knows to re-pick.
  const resolveQuery = useQuery({
    ...orpc.lookup.resolve.queryOptions({
      input: { kind, id: value ?? "", scope },
    }),
    enabled: value !== null,
  });

  const listQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      input: { kind, query: query.trim() || undefined, scope, limit: 20 },
    }),
    enabled: open,
  });

  const selected = value !== null ? (resolveQuery.data?.result ?? null) : null;
  const items = listQuery.data?.items ?? [];

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div className="min-w-0 flex-1">
        {renderDisplay({
          testId,
          value,
          selected,
          isResolving: resolveQuery.isLoading,
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        data-testid={`${testId}-open`}
      >
        {value === null ? "Select" : "Change"}
      </Button>
      {value !== null && !required ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange(null);
          }}
          data-testid={`${testId}-clear`}
        >
          Clear
        </Button>
      ) : null}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={`Search and pick a ${kind}`}
      >
        <CommandInput
          placeholder={`Search ${kind}…`}
          value={query}
          onValueChange={setQuery}
          data-testid={`${testId}-search`}
        />
        <CommandList>
          {renderListBody({
            isLoading: listQuery.isLoading,
            items,
            testId,
            onSelect: (id) => {
              onChange(id);
              setOpen(false);
            },
          })}
        </CommandList>
      </CommandDialog>
    </div>
  );
}

interface LookupItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
}

function renderDisplay({
  testId,
  value,
  selected,
  isResolving,
}: {
  testId: string;
  value: string | null;
  selected: LookupItem | null;
  isResolving: boolean;
}): ReactNode {
  if (value === null) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid={`${testId}-empty`}
      >
        None selected
      </p>
    );
  }
  if (selected) {
    return (
      <div className="text-sm" data-testid={`${testId}-selected`}>
        <p className="truncate font-medium">{selected.label}</p>
        {selected.subtitle ? (
          <p className="text-muted-foreground truncate text-xs">
            {selected.subtitle}
          </p>
        ) : null}
      </div>
    );
  }
  if (isResolving) {
    // Loading state distinct from orphan — without this skeleton the
    // brief gap between "value set" and "resolve returns" would
    // render as "Reference missing", which reads as an actual error.
    return (
      <div
        className="flex flex-col gap-1.5"
        data-testid={`${testId}-resolving`}
        aria-busy="true"
      >
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }
  return (
    <p className="text-destructive text-sm" data-testid={`${testId}-orphan`}>
      Reference missing — re-pick or clear
    </p>
  );
}

function renderListBody({
  isLoading,
  items,
  testId,
  onSelect,
}: {
  isLoading: boolean;
  items: readonly LookupItem[];
  testId: string;
  onSelect: (id: string) => void;
}): ReactNode {
  if (isLoading) return <CommandEmpty>Loading…</CommandEmpty>;
  if (items.length === 0) return <CommandEmpty>No matches</CommandEmpty>;
  return items.map((item) => (
    <CommandItem
      key={item.id}
      value={`${item.label} ${item.subtitle ?? ""}`}
      onSelect={() => {
        onSelect(item.id);
      }}
      data-testid={`${testId}-option-${item.id}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{item.label}</span>
        {item.subtitle ? (
          <span className="text-muted-foreground text-xs">{item.subtitle}</span>
        ) : null}
      </div>
    </CommandItem>
  ));
}
