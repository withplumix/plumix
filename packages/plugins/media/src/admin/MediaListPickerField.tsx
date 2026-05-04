import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { MediaLibrary } from "./MediaLibrary.js";

// `mediaList` field admin renderer. Reads the value as
// `MediaValue[]` — `[{ id, mime?, filename? }, ...]`. Renders each
// entry as a row in a vertical strip with Up / Down / Remove
// buttons; "Add more" opens MediaLibrary in modal/picker mode.
//
// Picker stays open across selections (the modal doesn't close on
// pick — only on Cancel or when the array hits `max`). Cached
// storage means each row's preview renders directly from the
// stored snapshot — zero resolve roundtrips per render.
//
// Drag-reorder is deferred to a follow-up — exposing dnd-kit as a
// shared runtime module to plugin chunks needs separate work, and
// up/down buttons satisfy the keyboard-reorder acceptance criterion
// for v0.1.

interface MediaValue {
  readonly id: string;
  readonly mime?: string;
  readonly filename?: string;
}

function normalizeArray(raw: unknown): readonly MediaValue[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaValue[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item !== "") {
      // Interim bare-string state right after a pick, before the
      // meta pipeline normalizes on save. Treat as `{ id }` so the
      // row still renders (with a "Selected (id N)" placeholder).
      out.push({ id: item });
      continue;
    }
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { readonly id?: unknown }).id === "string"
    ) {
      const obj = item as Record<string, unknown>;
      const id = obj.id as string;
      if (id === "") continue;
      out.push({
        id,
        mime: typeof obj.mime === "string" ? obj.mime : undefined,
        filename: typeof obj.filename === "string" ? obj.filename : undefined,
      });
    }
  }
  return out;
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

function readMax(field: MetaBoxFieldManifestEntry): number | undefined {
  const max = (field as { readonly max?: unknown }).max;
  return typeof max === "number" ? max : undefined;
}

export function MediaListPickerField({
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
  const value = normalizeArray(rhf.value);
  const accept = readAccept(field);
  const max = readMax(field);
  const atMax = max !== undefined && value.length >= max;

  // Auto-close when the array hits `max` — picker shouldn't stay
  // open if there's nowhere to put the next pick. `handlePick` is
  // sync today; if it ever becomes async (e.g. server-side accept
  // re-validation before commit), this effect will close the modal
  // before the pick lands. Defer that fix until the async path
  // actually exists.
  useEffect(() => {
    if (open && atMax) setOpen(false);
  }, [open, atMax]);

  const updateAt = (next: readonly MediaValue[]): void => {
    rhf.onChange(next);
    rhf.onBlur();
  };

  const handlePick = (id: string): void => {
    if (atMax) return;
    // Admin-side dedup: the picker rejects re-adding an id that's
    // already in the array. The server-side meta pipeline does NOT
    // dedup — an API caller submitting `[id1, id1]` over the wire
    // gets `[{id:id1, ...}, {id:id1, ...}]` stored. The contract:
    // the picker enforces the common case, the API stays minimal.
    // Re-saving an API-supplied duplicate through the admin will
    // collapse it.
    if (value.some((v) => v.id === id)) return;
    updateAt([...value, { id }]);
  };

  const handleRemove = (idx: number): void => {
    const next = [...value];
    next.splice(idx, 1);
    updateAt(next);
  };

  const handleMove = (idx: number, direction: -1 | 1): void => {
    const target = idx + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [item] = next.splice(idx, 1);
    if (item !== undefined) next.splice(target, 0, item);
    updateAt(next);
  };

  return (
    <div
      data-testid={testId}
      className="border-input flex flex-col gap-2 rounded-md border p-2"
    >
      {value.length === 0 ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid={`${testId}-empty`}
        >
          No media selected
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid={`${testId}-list`}>
          {value.map((item, idx) => (
            // `key` is the bare id, NOT id+idx. `handlePick` rejects
            // duplicate ids (admin-side dedup) so id is unique per
            // array. Reordering then preserves React identity for
            // each row — Tab focus stays on the button the user just
            // clicked instead of resetting on every move.
            <MediaListItem
              key={item.id}
              item={item}
              index={idx}
              count={value.length}
              testId={testId}
              disabled={disabled}
              onMove={handleMove}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hover:bg-muted rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || atMax}
          onClick={() => setOpen(true)}
          data-testid={`${testId}-add`}
        >
          {value.length === 0 ? "Select" : "Add more"}
        </button>
        {max !== undefined ? (
          <span
            className="text-muted-foreground text-xs"
            data-testid={`${testId}-count`}
          >
            {value.length} / {max}
          </span>
        ) : null}
      </div>
      {open ? (
        <MediaListPickerModal
          accept={accept}
          onSelect={handlePick}
          onCancel={() => setOpen(false)}
          testId={`${testId}-modal`}
        />
      ) : null}
    </div>
  );
}

function MediaListItem({
  item,
  index,
  count,
  testId,
  disabled,
  onMove,
  onRemove,
}: {
  readonly item: MediaValue;
  readonly index: number;
  readonly count: number;
  readonly testId: string;
  readonly disabled: boolean;
  readonly onMove: (idx: number, direction: -1 | 1) => void;
  readonly onRemove: (idx: number) => void;
}): ReactNode {
  const rowTestId = `${testId}-row-${item.id}`;
  const displayName = item.filename ?? item.id;
  return (
    <li
      className="border-input bg-background flex items-center gap-2 rounded-md border px-2 py-1.5"
      data-testid={rowTestId}
    >
      <div className="min-w-0 flex-1 text-sm">
        {item.filename ? (
          <>
            <p className="truncate font-medium" title={item.filename}>
              {item.filename}
            </p>
            {item.mime ? (
              <p className="text-muted-foreground text-xs">{item.mime}</p>
            ) : null}
          </>
        ) : (
          <p data-testid={`${rowTestId}-pending`}>Selected (id {item.id})</p>
        )}
      </div>
      <button
        type="button"
        className="hover:bg-muted rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || index === 0}
        onClick={() => onMove(index, -1)}
        aria-label={`Move ${displayName} up`}
        data-testid={`${rowTestId}-up`}
      >
        ↑
      </button>
      <button
        type="button"
        className="hover:bg-muted rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, 1)}
        aria-label={`Move ${displayName} down`}
        data-testid={`${rowTestId}-down`}
      >
        ↓
      </button>
      <button
        type="button"
        className="hover:bg-muted rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => onRemove(index)}
        aria-label={`Remove ${displayName}`}
        data-testid={`${rowTestId}-remove`}
      >
        ✕
      </button>
    </li>
  );
}

// Modal that hosts MediaLibrary in picker mode. Doesn't close on
// `onSelect` — multi-select stays open until the user clicks Cancel
// or the parent's effect closes it on `atMax`. Window-level Escape
// listener mirrors the single-pick modal in MediaPickerField.
function MediaListPickerModal({
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
      aria-label="Add media"
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
