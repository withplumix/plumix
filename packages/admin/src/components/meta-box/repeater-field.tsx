import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { useId } from "react";
import { Button } from "@/components/ui/button.js";
import { SortableList } from "@/components/ui/sortable.js";
import { PlusIcon } from "lucide-react";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

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
  const subFields = field.subFields ?? [];
  const max = typeof field.max === "number" ? field.max : undefined;
  const min = typeof field.min === "number" ? field.min : undefined;
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
      className="border-input flex flex-col gap-2 rounded-md border p-2"
    >
      {rows.length === 0 ? (
        <p
          className="text-muted-foreground text-sm"
          data-testid={`${testId}-empty`}
        >
          No rows
        </p>
      ) : (
        <SortableList
          items={items}
          onReorder={handleReorder}
          onRemove={disabled ? undefined : handleRemove}
          disabled={disabled}
          testId={`${testId}-list`}
          renderItem={(item) => (
            <RepeaterRowFields
              subFields={subFields}
              rowName={`${rhf.name}.${item.index}`}
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
          {rows.length === 0 ? "Add row" : "Add another"}
        </Button>
        {max !== undefined || min !== undefined ? (
          <span
            className="text-muted-foreground text-xs"
            data-testid={`${testId}-count`}
          >
            {rows.length}
            {min !== undefined ? ` / min ${min}` : ""}
            {max !== undefined ? ` / max ${max}` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RepeaterRowFields({
  subFields,
  rowName,
  disabled,
  testId,
}: {
  readonly subFields: readonly MetaBoxFieldManifestEntry[];
  readonly rowName: string;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {subFields.map((sf) => (
        <MetaBoxField
          key={sf.key}
          field={sf}
          name={`${rowName}.${sf.key}`}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
