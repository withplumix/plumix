import type { MessageDescriptor } from "plumix/i18n";
import type { MetaBoxFieldManifestEntry } from "plumix/plugin";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle } from "plumix/admin/ui";
import { useLingui } from "plumix/i18n";

import { MediaLibrary } from "./MediaLibrary.js";

const M = {
  empty: {
    id: "plugin.media.listField.empty",
    message: "No media selected",
  },
  buttonSelect: {
    id: "plugin.media.listField.button.select",
    message: "Select",
  },
  buttonAddMore: {
    id: "plugin.media.listField.button.addMore",
    message: "Add more",
  },
  pending: {
    id: "plugin.media.listField.pending",
    message: "Selected (id {id})",
    comment: "id: the media item's numeric id, shown while filename loads",
  },
  moveUpAria: {
    id: "plugin.media.listField.moveUpAria",
    message: "Move {name} up",
    comment: "name: the row's display name (filename or id)",
  },
  moveDownAria: {
    id: "plugin.media.listField.moveDownAria",
    message: "Move {name} down",
    comment: "name: the row's display name (filename or id)",
  },
  removeAria: {
    id: "plugin.media.listField.removeAria",
    message: "Remove {name}",
    comment: "name: the row's display name (filename or id)",
  },
  modalAria: {
    id: "plugin.media.listField.modalAria",
    message: "Add media",
  },
} satisfies Record<string, MessageDescriptor>;

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
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const value = normalizeArray(rhf.value);
  const accept = readAccept(field);
  const max = readMax(field);
  const atMax = max !== undefined && value.length >= max;

  const updateAt = (next: readonly MediaValue[]): void => {
    rhf.onChange(next);
    rhf.onBlur();
    // Auto-close when the array hits `max` — picker shouldn't stay
    // open if there's nowhere to put the next pick. Driven from the
    // commit path so async server-side accept-revalidation (if ever
    // added) closes the modal AFTER the pick lands, not before.
    if (max !== undefined && next.length >= max) setOpen(false);
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
          {i18n._(M.empty)}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || atMax}
          onClick={() => setOpen(true)}
          data-testid={`${testId}-add`}
        >
          {value.length === 0
            ? i18n._(M.buttonSelect)
            : i18n._(M.buttonAddMore)}
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
  const { i18n } = useLingui();
  const rowTestId = `${testId}-row-${item.id}`;
  const displayName = item.filename ?? item.id;
  const ariaValues = { name: displayName };
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
          <p data-testid={`${rowTestId}-pending`}>
            {i18n._(
              M.pending.id,
              { id: item.id },
              { message: M.pending.message },
            )}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={disabled || index === 0}
        onClick={() => onMove(index, -1)}
        aria-label={i18n._(M.moveUpAria.id, ariaValues, {
          message: M.moveUpAria.message,
        })}
        data-testid={`${rowTestId}-up`}
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, 1)}
        aria-label={i18n._(M.moveDownAria.id, ariaValues, {
          message: M.moveDownAria.message,
        })}
        data-testid={`${rowTestId}-down`}
      >
        ↓
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={disabled}
        onClick={() => onRemove(index)}
        aria-label={i18n._(M.removeAria.id, ariaValues, {
          message: M.removeAria.message,
        })}
        data-testid={`${rowTestId}-remove`}
      >
        ✕
      </Button>
    </li>
  );
}

// Modal that hosts MediaLibrary in picker mode, on the shared `Dialog`
// from `plumix/admin/ui`. Doesn't close on `onSelect` — multi-select
// stays open until the user clicks Cancel or the parent closes it on
// reaching `max`. Radix handles the focus trap, Escape, and backdrop
// dismiss (routed through `onOpenChange` → `onCancel`).
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
