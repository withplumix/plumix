import type { MetaBoxFieldManifestEntry } from "plumix/plugin";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

import type { MediaSelection } from "./MediaLibrary.js";
// Reuses the media picker's modal, accept-scope reader, and its generic
// pick-verb strings (Select/Change/empty) on purpose — a single-value url
// picker wants the same copy; no separate catalog namespace is warranted.
import { M, MediaPickerModal, readAccept } from "./MediaPickerField.js";

// `mediaUrl` field renderer: the value is a bare url string, not the
// `{ id, url, ... }` composite the `media` field stores. Used by the Styles
// tab's background control, which persists a CSS `url("…")`. Picks/uploads
// through the same shared library modal; on select it writes the asset's url.
export function MediaUrlField({
  field,
  rhf,
  disabled,
  testId,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly rhf: {
    readonly value: unknown;
    readonly onChange: (next: unknown) => void;
    readonly onBlur: () => void;
    readonly name: string;
  };
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const url = typeof rhf.value === "string" ? rhf.value : "";
  const accept = readAccept(field);

  const handleSelect = (selection: MediaSelection): void => {
    rhf.onChange(selection.url);
    setOpen(false);
    rhf.onBlur();
  };
  const handleClear = (): void => {
    rhf.onChange(null);
    rhf.onBlur();
  };

  return (
    <div
      data-testid={testId}
      className="border-input flex items-center gap-2 rounded-md border px-2 py-1.5"
    >
      <div className="min-w-0 flex-1">
        {url ? (
          <img
            src={url}
            alt=""
            className="size-10 rounded object-cover"
            data-testid={`${testId}-preview`}
          />
        ) : (
          <p
            className="text-muted-foreground text-sm"
            data-testid={`${testId}-empty`}
          >
            {i18n._(M.empty)}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid={`${testId}-open`}
      >
        {i18n._(url ? M.buttonChange : M.buttonSelect)}
      </Button>
      {url ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={handleClear}
          data-testid={`${testId}-clear`}
        >
          <Trans id="plugin.media.pickerField.clear" message="Clear" />
        </Button>
      ) : null}
      {open ? (
        <MediaPickerModal
          accept={accept}
          onSelect={handleSelect}
          onCancel={() => setOpen(false)}
          testId={`${testId}-modal`}
        />
      ) : null}
    </div>
  );
}
