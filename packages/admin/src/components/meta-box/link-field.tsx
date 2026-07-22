import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { useState } from "react";
import { publicEntryTypeNames } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { useUntitledLabel } from "@/lib/use-untitled-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Button } from "@plumix/admin-ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@plumix/admin-ui/command";
import { Input } from "@plumix/admin-ui/input";
import { Switch } from "@plumix/admin-ui/switch";

// Admin control for the `link` field — a CTA-shaped `{ url, label?,
// newTab? }` value. The URL is authored either by typing an external
// URL or by picking an internal entry, which resolves to its permalink
// via the lookup RPC's `href` and stores that plain URL (no reference,
// no hydration — renaming the entry does not retarget the link).

const M = {
  url: defineMessage({
    id: "metaBox.link.url",
    message: "URL",
  }),
  linkText: defineMessage({
    id: "metaBox.link.text",
    message: "Link text",
  }),
  newTab: defineMessage({
    id: "metaBox.link.newTab",
    message: "Open in new tab",
  }),
  pick: defineMessage({
    id: "metaBox.link.pick",
    message: "Pick entry",
  }),
  dialogDescription: defineMessage({
    id: "metaBox.link.dialogDescription",
    message: "Search and pick an entry to link to",
  }),
  searchPlaceholder: defineMessage({
    id: "metaBox.link.searchPlaceholder",
    message: "Search entries…",
  }),
} satisfies Record<string, MessageDescriptor>;

// Display-state view of the stored value. Absent optionals render as
// empty string / off so the inputs stay controlled.
interface LinkDraft {
  readonly url: string;
  readonly label: string;
  readonly newTab: boolean;
}

function toDraft(value: unknown): LinkDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { url: "", label: "", newTab: false };
  }
  const { url, label, newTab } = value as Record<string, unknown>;
  return {
    url: typeof url === "string" ? url : "",
    label: typeof label === "string" ? label : "",
    newTab: newTab === true,
  };
}

export function LinkField({
  field,
  rhf,
  disabled,
  testId,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly rhf: ControllerRenderProps<FieldValues, string>;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  const labelFn = useLabel();
  const untitledLabel = useUntitledLabel();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const draft = toDraft(rhf.value);
  const entryTypes = publicEntryTypeNames();

  const listQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      input: {
        kind: "entry",
        query: query.trim() || undefined,
        scope: { entryTypes },
        limit: 20,
      },
    }),
    enabled: open,
  });
  // Only entries with a public URL can back a link value.
  const items = (listQuery.data?.items ?? []).filter(
    (item) => item.href !== undefined,
  );

  // A fully-empty draft clears the key (deletion on save) instead of
  // persisting `{ url: "" }`, which the server would reject.
  const emit = (next: LinkDraft): void => {
    if (next.url === "" && next.label === "" && !next.newTab) {
      rhf.onChange(null);
      return;
    }
    rhf.onChange({
      url: next.url,
      ...(next.label !== "" ? { label: next.label } : {}),
      ...(next.newTab ? { newTab: true } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Input
          name={rhf.name}
          type="text"
          inputMode="url"
          value={draft.url}
          placeholder={
            field.placeholder ? labelFn(field.placeholder) : undefined
          }
          required={field.required}
          disabled={disabled}
          onBlur={rhf.onBlur}
          onChange={(e) => {
            emit({ ...draft, url: e.target.value });
          }}
          aria-label={labelFn(M.url)}
          data-testid={`${testId}-url`}
        />
        {entryTypes.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setQuery("");
              setOpen(true);
            }}
            data-testid={`${testId}-pick`}
          >
            {labelFn(M.pick)}
          </Button>
        ) : null}
      </div>
      <Input
        type="text"
        value={draft.label}
        disabled={disabled}
        onChange={(e) => {
          emit({ ...draft, label: e.target.value });
        }}
        aria-label={labelFn(M.linkText)}
        placeholder={labelFn(M.linkText)}
        data-testid={`${testId}-label`}
      />
      <label className="flex w-fit items-center gap-2 text-sm">
        <Switch
          checked={draft.newTab}
          disabled={disabled}
          onCheckedChange={(checked) => {
            emit({ ...draft, newTab: checked });
          }}
          aria-label={labelFn(M.newTab)}
          data-testid={`${testId}-newtab`}
        />
        <Trans id="metaBox.link.newTab" message="Open in new tab" />
      </label>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={labelFn(field.label)}
        description={labelFn(M.dialogDescription)}
      >
        <CommandInput
          placeholder={labelFn(M.searchPlaceholder)}
          value={query}
          onValueChange={setQuery}
          data-testid={`${testId}-search`}
        />
        <CommandList>
          {renderListBody({
            isLoading: listQuery.isLoading,
            items,
            testId,
            untitledLabel,
            onSelect: (href) => {
              emit({ ...draft, url: href });
              setOpen(false);
            },
          })}
        </CommandList>
      </CommandDialog>
    </div>
  );
}

interface LinkLookupItem {
  readonly id: string;
  readonly label: string | null;
  readonly targetType?: string;
  readonly subtitle?: string;
  readonly href?: string;
}

function renderListBody({
  isLoading,
  items,
  testId,
  untitledLabel,
  onSelect,
}: {
  isLoading: boolean;
  items: readonly LinkLookupItem[];
  testId: string;
  untitledLabel: ReturnType<typeof useUntitledLabel>;
  onSelect: (href: string) => void;
}): ReactNode {
  if (isLoading) {
    return (
      <CommandEmpty>
        <Trans id="metaBox.link.loading" message="Loading…" />
      </CommandEmpty>
    );
  }
  if (items.length === 0) {
    return (
      <CommandEmpty>
        <Trans id="metaBox.link.noMatches" message="No matches" />
      </CommandEmpty>
    );
  }
  return items.map((item) => (
    <CommandItem
      key={item.id}
      value={`${item.label ?? ""} ${item.subtitle ?? ""}`}
      onSelect={() => {
        if (item.href !== undefined) onSelect(item.href);
      }}
      data-testid={`${testId}-option-${item.id}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          {untitledLabel(item.label, item.targetType)}
        </span>
        {item.subtitle ? (
          <span className="text-muted-foreground text-xs">{item.subtitle}</span>
        ) : null}
      </div>
    </CommandItem>
  ));
}
