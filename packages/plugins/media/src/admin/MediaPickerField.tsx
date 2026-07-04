import type { MetaBoxFieldManifestEntry } from "plumix/plugin";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle } from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

import type { MediaSelection } from "./MediaLibrary.js";
import { MediaLibrary } from "./MediaLibrary.js";
import { M } from "./messages.js";

export { M } from "./messages.js";

// `media` field admin renderer. Registered into the host admin's
// plugin-field-type registry on module load (see admin/index.tsx),
// dispatched from the meta-box-field renderer's plugin path.
//
// Reads value as a `MediaValue`-shaped object: `{ id, mime?, filename? }`.
// Renders the cached snapshot directly — zero resolve round-trips per
// render. The "Select" / "Change" button opens a fixed-position modal
// containing `<MediaLibrary mode="picker" accept={accept} />`; on
// confirm the modal closes and writes back the bare id (the meta
// pipeline normalizes to the cached-object shape on save).

interface MediaValue {
  readonly id: string;
  readonly mime?: string;
  readonly filename?: string;
  readonly url?: string;
  readonly alt?: string | null;
}

function normalizeValue(raw: unknown): MediaValue | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id === "") return null;
  return {
    id: obj.id,
    mime: typeof obj.mime === "string" ? obj.mime : undefined,
    filename: typeof obj.filename === "string" ? obj.filename : undefined,
    url: typeof obj.url === "string" ? obj.url : undefined,
    alt: typeof obj.alt === "string" ? obj.alt : null,
  };
}

// Clear is offered only for standalone metabox fields. In the block editor
// (signalled by the sibling `attrs` the block passes down) the block itself is
// the unit an author removes, so a per-field Clear is redundant clutter.
export function offersClear(
  hasValue: boolean,
  required: boolean,
  inBlockEditor: boolean,
): boolean {
  return hasValue && !required && !inBlockEditor;
}

export function readAccept(
  field: MetaBoxFieldManifestEntry,
): string | readonly string[] | undefined {
  const scope = field.referenceTarget?.scope as
    { readonly accept?: unknown } | undefined;
  const accept = scope?.accept;
  if (typeof accept === "string") return accept;
  if (Array.isArray(accept)) {
    return accept.filter((s): s is string => typeof s === "string");
  }
  return undefined;
}

export function MediaPickerField({
  field,
  rhf,
  disabled,
  testId,
  attrs,
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
  // Present only in the block inspector (the block's sibling attributes);
  // absent in metaboxes. Used purely to know which context we're rendering in.
  readonly attrs?: Readonly<Record<string, unknown>>;
}): ReactNode {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const value = normalizeValue(rhf.value);
  const accept = readAccept(field);
  const required = field.required === true;

  const handleSelect = (selection: MediaSelection): void => {
    // Write back the resolved snapshot ({ id, url, alt, mime, filename }).
    // The block editor stores url/alt directly for render; the metabox meta
    // pipeline reads `id` and re-normalizes to the cached-object shape on
    // save, ignoring the extra keys.
    rhf.onChange(selection);
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
        {value ? (
          <MediaPreview value={value} testId={testId} />
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
        {value ? i18n._(M.buttonChange) : i18n._(M.buttonSelect)}
      </Button>
      {offersClear(value != null, required, attrs !== undefined) ? (
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

function MediaPreview({
  value,
  testId,
}: {
  readonly value: MediaValue;
  readonly testId: string;
}): ReactNode {
  const { i18n } = useLingui();
  // The cached storage gives us `mime` + `filename` directly — no
  // resolve round-trip per render. If they're missing (interim
  // bare-string state right after pick), fall back to "Selected: <id>"
  // until the next save normalizes the shape.
  if (!value.filename) {
    return (
      <p className="text-sm" data-testid={`${testId}-pending`}>
        {i18n._(M.pending.id, { id: value.id }, { message: M.pending.message })}
      </p>
    );
  }
  return (
    <div className="min-w-0 text-sm">
      <p
        className="truncate font-medium"
        data-testid={`${testId}-filename`}
        title={value.filename}
      >
        {value.filename}
      </p>
      {value.mime ? (
        <p className="text-muted-foreground text-xs">{value.mime}</p>
      ) : null}
    </div>
  );
}

// Modal hosting the MediaLibrary in picker mode, built on the shared
// `Dialog` from `plumix/admin/ui` — radix handles the focus trap, Escape,
// and backdrop dismiss that this used to wire by hand. Mounted only while
// open (parent renders conditionally), so closing routes through
// `onOpenChange` → `onCancel`.
export function MediaPickerModal({
  accept,
  onSelect,
  onCancel,
  testId,
}: {
  readonly accept: string | readonly string[] | undefined;
  readonly onSelect: (selection: MediaSelection) => void;
  readonly onCancel: () => void;
  readonly testId: string;
}): ReactNode {
  const { i18n } = useLingui();

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        data-testid={testId}
        showCloseButton={false}
        className="flex max-h-[90vh] max-w-5xl flex-col overflow-y-auto"
      >
        {/* MediaLibrary renders its own visible heading + footer controls;
            this names the dialog for assistive tech without duplicating it
            on screen. */}
        <DialogTitle className="sr-only">{i18n._(M.modalAria)}</DialogTitle>
        <MediaLibrary
          mode="picker"
          accept={accept}
          onSelect={onSelect}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  );
}
