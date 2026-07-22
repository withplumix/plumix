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

import type { EntryFieldScope } from "@plumix/core/fields";
import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Button } from "@plumix/admin-ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
} from "@plumix/admin-ui/command";
import { Input } from "@plumix/admin-ui/input";
import { Switch } from "@plumix/admin-ui/switch";

import { renderLookupListBody } from "./reference-picker.js";

// Admin control for the `link` field — a CTA-shaped `{ url, label?,
// newTab? }` value. The URL is authored either by typing an external
// URL or by picking a published internal entry, which resolves to its
// permalink via the lookup RPC's `href` and stores that plain URL (no
// reference, no hydration — renaming the entry does not retarget the
// link).

const M = {
  url: defineMessage({
    id: "metaBox.link.url",
    message: "URL",
  }),
  linkText: defineMessage({
    id: "metaBox.link.text",
    message: "Link text",
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

// Display-state view of the value. Absent optionals render as empty
// string / off so the inputs stay controlled.
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

function sameDraft(a: LinkDraft, b: LinkDraft): boolean {
  return a.url === b.url && a.label === b.label && a.newTab === b.newTab;
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

  // The inputs edit a local draft so a half-filled state (link text
  // typed before the URL) survives in the UI while the form value
  // stays valid: a draft without a URL emits `null` (the server
  // rejects `{ url: "" }`, and an absent key is a deletion on save).
  // External resyncs (`form.reset()` post-save) are detected with the
  // state-during-render snapshot pattern — see `JsonControl`.
  const externalDraft = toDraft(rhf.value);
  const [draft, setDraft] = useState(externalDraft);
  const [lastSynced, setLastSynced] = useState(externalDraft);
  if (!sameDraft(externalDraft, lastSynced)) {
    setLastSynced(externalDraft);
    setDraft(externalDraft);
  }

  const update = (next: LinkDraft): void => {
    setDraft(next);
    const value =
      next.url === ""
        ? null
        : {
            url: next.url,
            ...(next.label !== "" ? { label: next.label } : {}),
            ...(next.newTab ? { newTab: true } : {}),
          };
    // Track what we emitted so the resync branch only fires for
    // changes made outside this control.
    setLastSynced(toDraft(value));
    rhf.onChange(value);
  };

  const entryTypes = publicEntryTypeNames();

  // Only published entries have a permalink worth storing — a draft's
  // URL would 404 (and go stale on slug edits). `satisfies` keeps the
  // status literal tracking the `EntryStatus` vocabulary.
  const scope = { entryTypes, status: "published" } satisfies EntryFieldScope;
  const listQuery = useQuery({
    ...orpc.lookup.list.queryOptions({
      input: {
        kind: "entry",
        query: query.trim() || undefined,
        scope,
        limit: 20,
      },
    }),
    enabled: open,
  });
  // Only entries with a public URL can back a link value.
  const items = (listQuery.data?.items ?? []).filter(
    (item) => item.href !== undefined,
  );

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
            update({ ...draft, url: e.target.value });
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
          update({ ...draft, label: e.target.value });
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
            update({ ...draft, newTab: checked });
          }}
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
          {renderLookupListBody({
            isLoading: listQuery.isLoading,
            items,
            testId,
            untitledLabel,
            onSelect: (item) => {
              if (item.href !== undefined) update({ ...draft, url: item.href });
              setOpen(false);
            },
          })}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
