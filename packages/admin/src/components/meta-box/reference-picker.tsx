import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { DIALOG_CLOSE_LABEL } from "@/lib/dialog-labels.js";
import { currentManifest } from "@/lib/manifest.js";
import { useLabel } from "@/lib/use-label.js";
import { useUntitledLabel } from "@/lib/use-untitled-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

import type { JsonObject } from "@plumix/core";
import { Button } from "@plumix/admin-ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
} from "@plumix/admin-ui/command";
import { Skeleton } from "@plumix/admin-ui/skeleton";

import type { ResolvedReference } from "./lookup/reference-resolve.js";
import type { LookupItem } from "./lookup/types.js";
import { renderLookupListBody } from "./lookup/list-body.js";
import { lookupListNotice, referencePickerCopy } from "./lookup/picker-copy.js";
import { useLookupSearch } from "./lookup/use-lookup-search.js";
import { useReferenceResolve } from "./lookup/use-reference-resolve.js";

// Stores the bare id; only the display becomes a label.

const M = {
  selectIdle: defineMessage({
    id: "metaBox.reference.selectIdle",
    message: "Select",
  }),
  selectChange: defineMessage({
    id: "metaBox.reference.selectChange",
    message: "Change",
  }),
  clear: defineMessage({
    id: "metaBox.reference.clear",
    message: "Clear",
  }),
  emptyValue: defineMessage({
    id: "metaBox.reference.emptyValue",
    message: "None selected",
  }),
  orphan: defineMessage({
    id: "metaBox.reference.orphan",
    message: "Reference missing — re-pick or clear",
  }),
} satisfies Record<string, MessageDescriptor>;

interface ReferencePickerProps {
  readonly value: string | null;
  readonly onChange: (next: string | null) => void;
  readonly kind: string;
  readonly scope?: JsonObject;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly label: string;
  readonly testId: string;
  /** Skips the resolve round-trip while the initial id is unchanged. */
  readonly initialSelected?: LookupItem | null;
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
  initialSelected = null,
}: ReferencePickerProps): ReactNode {
  const labelFn = useLabel();
  const untitledLabel = useUntitledLabel();
  const [open, setOpen] = useState(false);

  // Resolve the currently-selected id to its label/subtitle, short-
  // circuiting when the hydrated `initialSelected` already covers it.
  const resolve = useReferenceResolve({
    kind,
    scope,
    ids: value === null ? [] : [value],
    initialSelected: initialSelected ? [initialSelected] : [],
  });
  const state = value === null ? null : resolve.statusOf(value);

  const search = useLookupSearch({ kind, scope, enabled: open });

  const copy = referencePickerCopy(kind, scope, currentManifest());
  const notice = lookupListNotice(copy, {
    isLoading: search.isLoading,
    isError: search.isError,
    itemCount: search.items.length,
    query: search.query,
  });

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div className="min-w-0 flex-1">
        {renderDisplay({ testId, state, untitledLabel })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          search.setQuery("");
          setOpen(true);
        }}
        data-testid={`${testId}-open`}
      >
        {value === null ? labelFn(M.selectIdle) : labelFn(M.selectChange)}
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
          {labelFn(M.clear)}
        </Button>
      ) : null}
      <CommandDialog
        open={open}
        closeLabel={labelFn(DIALOG_CLOSE_LABEL)}
        onOpenChange={setOpen}
        title={labelFn(copy.searchItems)}
        description={label}
      >
        <CommandInput
          placeholder={labelFn(copy.searchItems)}
          value={search.query}
          onValueChange={search.setQuery}
          data-testid={`${testId}-search`}
        />
        <CommandList>
          {renderLookupListBody({
            notice: notice === null ? null : labelFn(notice),
            items: search.items,
            testId,
            onSelect: (item) => {
              onChange(item.id);
              setOpen(false);
            },
            untitledLabel,
          })}
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function renderDisplay({
  testId,
  state,
  untitledLabel,
}: {
  testId: string;
  state: ResolvedReference | null;
  untitledLabel: ReturnType<typeof useUntitledLabel>;
}): ReactNode {
  if (state === null) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid={`${testId}-empty`}
      >
        <Trans id="metaBox.reference.emptyValue" message="None selected" />
      </p>
    );
  }
  if (state.status === "found") {
    const { item } = state;
    return (
      <div className="text-sm" data-testid={`${testId}-selected`}>
        <p className="truncate font-medium">
          {untitledLabel(item.label, item.targetType)}
        </p>
        {item.subtitle ? (
          <p className="text-muted-foreground truncate text-xs">
            {item.subtitle}
          </p>
        ) : null}
      </div>
    );
  }
  if (state.status === "pending") {
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
      <Trans
        id="metaBox.reference.orphan"
        message="Reference missing — re-pick or clear"
      />
    </p>
  );
}
