import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { useId, useState } from "react";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Button } from "@plumix/admin-ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@plumix/admin-ui/dialog";
import { Pencil, PlusIcon, TriangleAlert } from "@plumix/admin-ui/icons";
import { SortableList } from "@plumix/admin-ui/sortable";

import { MetaBoxField } from "./meta-box-field.js";
import {
  metaBoxFieldColSpanClass,
  repeaterDialogSizeClass,
} from "./meta-box-grid.js";

// Row ids are index-derived. dnd-kit only needs stability within a single
// drag; controlled subfields live at `${rowName}.${subKey}` in RHF state, so
// React identity at row level matters only for uncontrolled state (focus,
// selection). Accepting an occasional focus shift on reorder beats the
// impurity of mint-on-render.

interface RepeaterRow {
  readonly id: string;
  readonly index: number;
}

// Screen-reader name for the summary row's error triangle — the icon alone
// doesn't convey the error non-visually.
const ROW_ERROR_LABEL = defineMessage({
  id: "metaBox.repeater.rowError",
  message: "This row has an error",
});

// Accessible name for the icon-only Edit button. Row-numbered so a
// screen-reader rotor listing many rows' buttons can tell them apart —
// the icon carries no text, and every row's button is otherwise identical.
const EDIT_ROW_LABEL = defineMessage({
  id: "metaBox.repeater.editRow.button",
  message: "Edit row {n}",
  comment: "n: 1-based index of the repeater row",
});

// Render-side tolerance for malformed rows from migration / hand-edited
// DB rows. Bad rows drop from display but the validator still rejects
// them on save, surfacing the error to the author at write time.
function asRows(raw: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is Record<string, unknown> =>
      typeof r === "object" && r !== null && !Array.isArray(r),
  );
}

export function RepeaterField({
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
  const renderLabel = useLabel();
  const subFields = field.subFields ?? [];
  const max = typeof field.max === "number" ? field.max : undefined;
  const min = typeof field.min === "number" ? field.min : undefined;
  const collapsedKey = field.collapsed;
  const idPrefix = useId();
  // Which row's editor dialog is open (index into `rows`), or null.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const { control, getFieldState, clearErrors } = useFormContext();
  // Read the live array via `useWatch`, not the Controller's `rhf.value`
  // snapshot: a subfield edited in the dialog writes a nested path
  // (`${name}.${i}.${key}`) that doesn't re-render the parent Controller, so a
  // stale `rhf.value` would show outdated summaries — and, worse, let the next
  // add / remove / reorder commit an array missing the just-edited row's
  // fields, dropping them.
  const watched = useWatch({ control, name: rhf.name }) as unknown;
  const rows = asRows(watched ?? rhf.value);

  // A row's fields live in its dialog, so a server / validation error on a
  // sub-field would be invisible while the dialog is closed. Flag the summary
  // rows that hold an error so the author knows which to open. `getFieldState`
  // reads the subscribed `formState`, so the flags re-render as errors change.
  const formState = useFormState({ control, name: rhf.name });
  const rowHasError = (index: number): boolean =>
    getFieldState(`${rhf.name}.${index}`, formState).invalid;

  const atMax = max !== undefined && rows.length >= max;
  const items: readonly RepeaterRow[] = rows.map((_, i) => ({
    id: `${idPrefix}-r${i}`,
    index: i,
  }));

  // onChange-only — match MultiReferencePicker / ReferencePicker. Calling
  // onBlur on every Add/Remove/Reorder would mark the field touched in
  // `mode: "onTouched"` forms, surfacing required-field errors on a
  // freshly-Added blank row before the user types anything.
  const commit = (nextRows: readonly Record<string, unknown>[]): void => {
    rhf.onChange(nextRows);
  };

  // Reorder / remove shift indices, so the open dialog would point at the
  // wrong row — close it rather than silently editing a different row. The
  // index-keyed errors don't shift with the array, so clear the repeater's
  // error subtree too, otherwise a stale row indicator lands on the wrong row
  // (the next save recomputes them).
  const handleReorder = (next: readonly RepeaterRow[]): void => {
    setEditingIndex(null);
    clearErrors(rhf.name);
    commit(next.map((n) => rows[n.index] ?? {}));
  };

  const handleRemove = (id: string): void => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) return;
    setEditingIndex(null);
    clearErrors(rhf.name);
    const nextRows = [...rows];
    nextRows.splice(idx, 1);
    commit(nextRows);
  };

  const handleAdd = (): void => {
    if (atMax) return;
    const blank: Record<string, unknown> = {};
    for (const sf of subFields) {
      blank[sf.key] = sf.default ?? null;
    }
    commit([...rows, blank]);
    // Open the editor on the row we just appended so authoring is one click.
    setEditingIndex(rows.length);
  };

  const editingRow = editingIndex !== null ? rows[editingIndex] : undefined;
  const editingRowName =
    editingIndex !== null ? `${rhf.name}.${editingIndex}` : null;

  return (
    <div
      data-testid={testId}
      // `min-w-0` so a long summary (a wordy heading, a long option label)
      // truncates within the rail instead of growing the row and blowing the
      // meta panel's width — the field's grid cell has `min-width: auto`, so
      // without this the content sizes the column.
      className="border-input flex min-w-0 flex-col gap-2 rounded-md border p-2"
    >
      {rows.length === 0 ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid={`${testId}-empty`}
        >
          <Trans id="metaBox.repeater.empty" message="No rows" />
        </p>
      ) : (
        <SortableList
          items={items}
          onReorder={handleReorder}
          onRemove={disabled ? undefined : handleRemove}
          disabled={disabled}
          testId={`${testId}-list`}
          renderItem={(item) => (
            <RepeaterSummaryRow
              summary={rowSummary(
                rows[item.index] ?? {},
                subFields,
                collapsedKey,
                renderLabel,
              )}
              rowNumber={item.index + 1}
              disabled={disabled}
              hasError={rowHasError(item.index)}
              onEdit={() => {
                setEditingIndex(item.index);
              }}
              testId={`${testId}-row-${item.index}`}
            />
          )}
        />
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || atMax}
          onClick={handleAdd}
          data-testid={`${testId}-add`}
        >
          <PlusIcon className="size-4" />
          {field.addLabel ? (
            renderLabel(field.addLabel)
          ) : rows.length === 0 ? (
            <Trans id="metaBox.repeater.addFirst" message="Add row" />
          ) : (
            <Trans id="metaBox.repeater.addAnother" message="Add another" />
          )}
        </Button>
        {max !== undefined || min !== undefined ? (
          <span
            className="text-muted-foreground text-xs"
            data-testid={`${testId}-count`}
          >
            {rows.length}
            <CountSuffix min={min} max={max} />
          </span>
        ) : null}
      </div>

      {/* One shared dialog edits whichever row is open. The row's fields lay
          out on the same 12-column grid the top-level box uses, honouring each
          sub-field's `.span()` — the roomy surface a complex row can't get in
          the narrow document rail. */}
      <Dialog
        open={editingRow !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingIndex(null);
        }}
      >
        <DialogContent
          className={repeaterDialogSizeClass(field.dialogSize)}
          aria-describedby={undefined}
          data-testid={`${testId}-dialog`}
        >
          <DialogHeader>
            <DialogTitle>
              <Trans
                id="metaBox.repeater.editRow"
                message="Edit row {n}"
                values={{ n: (editingIndex ?? 0) + 1 }}
                comment="n: 1-based index of the repeater row being edited"
              />
            </DialogTitle>
          </DialogHeader>
          {editingRowName ? (
            <div className="@container">
              {/* `items-start` so a field showing a validation message grows
                  its own cell only — without it the grid stretches every
                  cell in the row to match, vertically centring the siblings'
                  controls out of line with the errored field. */}
              <div className="grid grid-cols-12 items-start gap-4">
                {subFields.map((sf) => (
                  <MetaBoxField
                    key={sf.key}
                    field={sf}
                    name={`${editingRowName}.${sf.key}`}
                    disabled={disabled}
                    className={metaBoxFieldColSpanClass(sf.span)}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                size="sm"
                data-testid={`${testId}-dialog-done`}
              >
                <Trans id="metaBox.repeater.done" message="Done" />
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// One row in the rail: a scannable summary + an Edit button opening the
// dialog. Drag-handle and remove come from the enclosing `SortableList`.
function RepeaterSummaryRow({
  summary,
  rowNumber,
  disabled,
  hasError,
  onEdit,
  testId,
}: {
  readonly summary: string | null;
  readonly rowNumber: number;
  readonly disabled: boolean;
  readonly hasError: boolean;
  readonly onEdit: () => void;
  readonly testId: string;
}): ReactNode {
  const renderLabel = useLabel();
  const { i18n } = useLingui();
  // Values-bearing descriptor — `useLabel` renders the ICU template
  // literally, so format the row number in via `i18n._` directly.
  const editLabel = i18n._(
    EDIT_ROW_LABEL.id,
    { n: rowNumber },
    {
      message: EDIT_ROW_LABEL.message,
    },
  );
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid={testId}>
      {hasError ? (
        <TriangleAlert
          className="text-destructive size-4 shrink-0"
          data-testid={`${testId}-error`}
          aria-label={renderLabel(ROW_ERROR_LABEL)}
        />
      ) : null}
      <span
        className="min-w-0 flex-1 truncate text-sm"
        data-testid={`${testId}-summary`}
      >
        {summary ?? (
          <Trans
            id="metaBox.repeater.rowSummaryEmpty"
            message="Row {n}"
            values={{ n: rowNumber }}
            comment="n: 1-based index of an unlabelled repeater row"
          />
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={onEdit}
        aria-label={editLabel}
        title={editLabel}
        data-testid={`${testId}-edit`}
      >
        <Pencil className="size-4" />
      </Button>
    </div>
  );
}

// `{rows.length} / min {min} / max {max}` rendered as one cohesive
// message per shape so translators see the whole template, not a
// leading-whitespace fragment. Returns null when neither bound is
// set — the caller's outer guard prevents that path anyway, but the
// component handles it defensively so the type signature stays
// loose.
function CountSuffix({
  min,
  max,
}: {
  readonly min: number | undefined;
  readonly max: number | undefined;
}): ReactNode {
  if (min !== undefined && max !== undefined) {
    return (
      <Trans
        id="metaBox.repeater.countSuffixBoth"
        message=" / min {min} / max {max}"
        values={{ min, max }}
        comment="min, max: integers bounding the repeater row count"
      />
    );
  }
  if (min !== undefined) {
    return (
      <Trans
        id="metaBox.repeater.countSuffixMin"
        message=" / min {min}"
        values={{ min }}
        comment="min: lower bound on the repeater row count"
      />
    );
  }
  if (max !== undefined) {
    return (
      <Trans
        id="metaBox.repeater.countSuffixMax"
        message=" / max {max}"
        values={{ max }}
        comment="max: upper bound on the repeater row count"
      />
    );
  }
  return null;
}

// The row summary: the explicit `.collapsed()` sub-field's value when set,
// otherwise the first sub-field carrying a non-empty primitive, so a row is
// recognisable at a glance. `null` when nothing suitable is present (caller
// falls back to the row number).
function rowSummary(
  row: Record<string, unknown>,
  subFields: readonly MetaBoxFieldManifestEntry[],
  collapsedKey: string | undefined,
  renderLabel: ReturnType<typeof useLabel>,
): string | null {
  if (collapsedKey !== undefined) {
    const sf = subFields.find((f) => f.key === collapsedKey);
    return cellSummary(row[collapsedKey], sf, renderLabel);
  }
  for (const sf of subFields) {
    const summary = cellSummary(row[sf.key], sf, renderLabel);
    if (summary !== null) return summary;
  }
  return null;
}

// A cell's stored value as a display string. For a select / radio the stored
// option *value* is resolved to its (i18n) label, so the summary reads "Card"
// rather than the raw stored "card"; other primitives render as-is. `null`
// when the value is absent / blank or a non-primitive (nested
// group/repeater/reference).
function cellSummary(
  value: unknown,
  field: MetaBoxFieldManifestEntry | undefined,
  renderLabel: ReturnType<typeof useLabel>,
): string | null {
  const raw = primitiveToString(value);
  if (raw === null) return null;
  const option = field?.options?.find((opt) => opt.value === raw);
  return option ? renderLabel(option.label) : raw;
}

// A stored primitive as a display string, or null when it's absent/blank or
// a non-primitive (a nested group/repeater/reference).
function primitiveToString(value: unknown): string | null {
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}
