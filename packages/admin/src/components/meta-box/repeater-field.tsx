import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { useId, useState } from "react";
import { useLabel } from "@/lib/use-label.js";
import { Trans } from "@lingui/react";

import type {
  MetaBoxFieldManifestEntry,
  RepeaterLayout,
} from "@plumix/core/manifest";
import { Button } from "@plumix/admin-ui/button";
import {
  ChevronDownIcon,
  ChevronRight,
  PlusIcon,
} from "@plumix/admin-ui/icons";
import { SortableList } from "@plumix/admin-ui/sortable";

import { MetaBoxField } from "./meta-box-field.js";

// Row ids are index-derived. dnd-kit only needs stability within a single
// drag; controlled subfields live at `${rowName}.${subKey}` in RHF state, so
// React identity at row level matters only for uncontrolled state (focus,
// selection). Accepting an occasional focus shift on reorder beats the
// impurity of mint-on-render.

interface RepeaterRow {
  readonly id: string;
  readonly index: number;
}

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

// Row-container layout class per `.layout()`. `row` lays a single row's
// fields out inline; `table` aligns them into columns under a shared
// header; `block` (the default) stacks them vertically. Values are
// Tailwind class strings + a layout enum, not display copy.
/* eslint-disable lingui/no-unlocalized-strings -- CSS classes + layout enum */
const ROW_LAYOUT_CLASS: Record<RepeaterLayout, string> = {
  block: "flex flex-col gap-2",
  row: "flex flex-row flex-wrap items-start gap-2",
  table: "grid gap-2",
};

const DEFAULT_LAYOUT: RepeaterLayout = "block";
/* eslint-enable lingui/no-unlocalized-strings */

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
  const layout: RepeaterLayout = field.layout ?? DEFAULT_LAYOUT;
  const collapsedKey = field.collapsed;
  const rows = asRows(rhf.value);
  const idPrefix = useId();

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

  const handleReorder = (next: readonly RepeaterRow[]): void => {
    commit(next.map((n) => rows[n.index] ?? {}));
  };

  const handleRemove = (id: string): void => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx === -1) return;
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
  };

  return (
    <div
      data-testid={testId}
      data-layout={layout}
      className="border-input flex flex-col gap-2 rounded-md border p-2"
    >
      {layout === "table" && rows.length > 0 ? (
        <div
          className="text-muted-foreground grid gap-2 px-1 text-xs font-medium"
          style={{ gridTemplateColumns: `repeat(${subFields.length}, 1fr)` }}
          data-testid={`${testId}-header`}
        >
          {subFields.map((sf) => (
            <span key={sf.key}>{renderLabel(sf.label)}</span>
          ))}
        </div>
      ) : null}
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
            <RepeaterRowContent
              subFields={subFields}
              row={rows[item.index] ?? {}}
              rowName={`${rhf.name}.${item.index}`}
              layout={layout}
              collapsedKey={collapsedKey}
              rowNumber={item.index + 1}
              disabled={disabled}
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

// One repeater row. When `collapsedKey` is set the row is collapsible and
// defaults to collapsed, showing the chosen sub-field's value as its
// summary so long lists stay scannable; otherwise the fields always
// render. Collapsing never unmounts the inputs' RHF registration (they
// live in form state, not the DOM), so a collapsed row still round-trips.
function RepeaterRowContent({
  subFields,
  row,
  rowName,
  layout,
  collapsedKey,
  rowNumber,
  disabled,
  testId,
}: {
  readonly subFields: readonly MetaBoxFieldManifestEntry[];
  readonly row: Record<string, unknown>;
  readonly rowName: string;
  readonly layout: RepeaterLayout;
  readonly collapsedKey: string | undefined;
  readonly rowNumber: number;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  const collapsible = collapsedKey !== undefined;
  const [open, setOpen] = useState(false);
  const showFields = !collapsible || open;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev);
          }}
          aria-expanded={open}
          className="flex items-center gap-1 text-start text-sm font-medium"
          data-testid={`${testId}-summary`}
        >
          {open ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRight className="size-4 rtl:rotate-180" />
          )}
          <span data-testid={`${testId}-summary-label`}>
            {rowSummary(row, collapsedKey) ?? (
              <Trans
                id="metaBox.repeater.rowSummaryEmpty"
                message="Row {n}"
                values={{ n: rowNumber }}
                comment="n: 1-based index of an unlabelled collapsed repeater row"
              />
            )}
          </span>
        </button>
      ) : null}
      {showFields ? (
        <div
          className={ROW_LAYOUT_CLASS[layout]}
          // `table` rows share the header's column template so each cell
          // lines up under its label.
          style={
            layout === "table"
              ? { gridTemplateColumns: `repeat(${subFields.length}, 1fr)` }
              : undefined
          }
        >
          {subFields.map((sf) => (
            <MetaBoxField
              key={sf.key}
              field={sf}
              name={`${rowName}.${sf.key}`}
              disabled={disabled}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The collapsed-row summary: the chosen sub-field's stored value as a
// display string, or `null` when it's absent/blank (caller falls back to
// the row number). Non-primitive values (a nested group/repeater picked
// as the summary key) render nothing here.
function rowSummary(
  row: Record<string, unknown>,
  key: string | undefined,
): string | null {
  if (key === undefined) return null;
  const value = row[key];
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}
