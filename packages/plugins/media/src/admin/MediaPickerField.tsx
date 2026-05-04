import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { MediaLibrary } from "./MediaLibrary.js";

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
}

function normalizeValue(raw: unknown): MediaValue | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id === "") return null;
  return {
    id: obj.id,
    mime: typeof obj.mime === "string" ? obj.mime : undefined,
    filename: typeof obj.filename === "string" ? obj.filename : undefined,
  };
}

function readAccept(
  field: MetaBoxFieldManifestEntry,
): string | readonly string[] | undefined {
  const scope = field.referenceTarget?.scope as
    | { readonly accept?: unknown }
    | undefined;
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
  const [open, setOpen] = useState(false);
  const value = normalizeValue(rhf.value);
  const accept = readAccept(field);
  const required = field.required === true;

  const handleSelect = (id: string): void => {
    // Write back the bare id; the meta pipeline normalizes to the
    // cached-object shape on save (`{ id, mime, filename }`). Until
    // the next save lands, the form holds a bare-string interim
    // value — `normalizeValue` accepts both shapes.
    rhf.onChange(id);
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
            No media selected
          </p>
        )}
      </div>
      <button
        type="button"
        className="hover:bg-muted rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen(true)}
        data-testid={`${testId}-open`}
      >
        {value ? "Change" : "Select"}
      </button>
      {value && !required ? (
        <button
          type="button"
          className="hover:bg-muted rounded px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={handleClear}
          data-testid={`${testId}-clear`}
        >
          Clear
        </button>
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
  // The cached storage gives us `mime` + `filename` directly — no
  // resolve round-trip per render. If they're missing (interim
  // bare-string state right after pick), fall back to "Selected: <id>"
  // until the next save normalizes the shape.
  if (!value.filename) {
    return (
      <p className="text-sm" data-testid={`${testId}-pending`}>
        Selected (id {value.id})
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

// Fixed-position modal hosting the MediaLibrary in picker mode.
// Mirrors the `ConfirmDialog` pattern in MediaLibrary.tsx (no shadcn
// `Dialog` shim is exposed to plugin chunks, so the plugin can't
// import it). Backdrop click + Escape dismiss. Body scroll is locked
// while open by the surrounding admin route layout.
function MediaPickerModal({
  accept,
  onSelect,
  onCancel,
  testId,
}: {
  readonly accept: string | readonly string[] | undefined;
  readonly onSelect: (id: string) => void;
  readonly onCancel: () => void;
  readonly testId: string;
}): ReactNode {
  // Window-level Escape listener — React's `onKeyDown` only fires when
  // focus is inside the modal. If the user clicked the backdrop (focus
  // goes to body) or focus drifted outside, the React handler misses
  // the event. Mounted only while the modal is open so it doesn't
  // intercept keystrokes on the rest of the admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-label="Select media"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="bg-background relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-y-auto rounded-lg p-4 shadow-lg"
        data-testid={`${testId}-panel`}
      >
        <MediaLibrary
          mode="picker"
          accept={accept}
          onSelect={onSelect}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
