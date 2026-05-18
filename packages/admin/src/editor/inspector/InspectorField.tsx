import type { ChangeEvent, ReactElement } from "react";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

import type { BlockAttributeSchema } from "@plumix/blocks";

interface InspectorFieldProps {
  readonly name: string;
  readonly schema: BlockAttributeSchema;
  readonly value: unknown;
  readonly onChange: (next: unknown) => void;
}

interface SelectOption {
  readonly value: string | number;
  readonly label: string;
}

const SELECT_CLASS =
  "border-input focus-visible:ring-ring h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none";

function stringifyScalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/**
 * Per-attribute input renderer for the block Inspector. Dispatches on
 * `schema.type` to a small set of canonical controls. Native form
 * elements rather than Radix popovers — the Inspector lives in a
 * persistent right-rail and a native `<select>` plays nicer with
 * keyboard nav, screen readers, and jsdom unit tests than a Radix
 * Select popover that needs floating-ui to render.
 */
export function InspectorField({
  name,
  schema,
  value,
  onChange,
}: InspectorFieldProps): ReactElement | null {
  const id = `inspector-field-${name}`;
  const label = schema.label ?? name;

  switch (schema.type) {
    case "select": {
      const options = Array.isArray(schema.options)
        ? (schema.options as readonly SelectOption[])
        : [];
      // Numeric options round-trip through the DOM as strings; coerce
      // back when the schema declared numbers so `updateAttributes`
      // receives the original type.
      const isNumeric = typeof options[0]?.value === "number";
      return (
        <div data-plumix-inspector-field={name} className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <select
            id={id}
            data-testid={id}
            value={stringifyScalar(value)}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => {
              const raw = event.target.value;
              onChange(isNumeric ? Number(raw) : raw);
            }}
            className={SELECT_CLASS}
          >
            {options.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case "boolean":
    case "checkbox":
      return (
        <div data-plumix-inspector-field={name} className="space-y-1.5">
          <Label htmlFor={id} className="flex items-center gap-2">
            <input
              id={id}
              data-testid={id}
              type="checkbox"
              checked={value === true}
              onChange={(event) => onChange(event.target.checked)}
            />
            {label}
          </Label>
        </div>
      );

    case "link":
    case "url":
      return (
        <div data-plumix-inspector-field={name} className="space-y-1.5">
          <Label htmlFor={id}>{label}</Label>
          <Input
            id={id}
            data-testid={id}
            type="url"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      );

    default:
      return null;
  }
}
