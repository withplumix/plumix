import type { ReactElement } from "react";
import { useId } from "react";
import { useLingui } from "@lingui/react";

import type { BlockInput, BlockInputOption } from "@plumix/blocks";
import { Checkbox } from "@plumix/admin-ui/checkbox";
import { Input } from "@plumix/admin-ui/input";
import { Label } from "@plumix/admin-ui/label";
import { resolveLabel } from "@plumix/core/i18n";

interface BlockInputControlProps {
  readonly input: BlockInput;
  readonly value: unknown;
  /** Emits the next typed value (string for text, number for number, etc.). */
  readonly onChange: (value: unknown) => void;
}

const FIELD_TESTID = (name: string): string => `block-input-${name}`;

/**
 * Renders one block attribute as an admin-ui form control, dispatching the
 * typed next value on edit. shadcn primitives where they map cleanly (text,
 * number, checkbox); native `<select>`/`<textarea>`/radio for the
 * option-bearing kinds so number/boolean option values survive the round trip
 * (radix Select is string-only). Mirrors the kinds the Puck field translator
 * supports so plugin blocks render unchanged.
 */
export function BlockInputControl({
  input,
  value,
  onChange,
}: BlockInputControlProps): ReactElement {
  const { i18n } = useLingui();
  const id = useId();
  const labelId = `${id}-label`;
  const testId = FIELD_TESTID(input.name);
  const label =
    input.label != null ? resolveLabel(input.label, i18n) : input.name;
  const options = input.options ?? [];

  const control = ((): ReactElement => {
    switch (input.type) {
      case "textarea":
        return (
          <textarea
            id={id}
            data-testid={testId}
            className="border-input flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      case "number":
        return (
          <Input
            id={id}
            data-testid={testId}
            type="number"
            value={asString(value)}
            onChange={(e) => {
              const next = e.target.valueAsNumber;
              // Empty or unparseable (a lone "-"/"e" mid-typing) clears to
              // null rather than poisoning the tree with NaN.
              onChange(Number.isNaN(next) ? null : next);
            }}
          />
        );
      case "checkbox":
        return (
          <Checkbox
            id={id}
            data-testid={testId}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
        );
      case "select":
        return (
          <select
            id={id}
            data-testid={testId}
            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            value={optionKey(value)}
            onChange={(e) => onChange(decodeOption(options, e.target.value))}
          >
            {options.map((opt) => (
              <option key={optionKey(opt.value)} value={optionKey(opt.value)}>
                {resolveLabel(opt.label, i18n)}
              </option>
            ))}
          </select>
        );
      case "radio":
        return (
          <div role="radiogroup" aria-labelledby={labelId} data-testid={testId}>
            {options.map((opt) => (
              <label key={optionKey(opt.value)} className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name={id}
                  value={optionKey(opt.value)}
                  checked={optionKey(value) === optionKey(opt.value)}
                  onChange={() => onChange(opt.value)}
                  data-testid={`${testId}-${optionKey(opt.value)}`}
                />
                {resolveLabel(opt.label, i18n)}
              </label>
            ))}
          </div>
        );
      case "combobox": {
        const listId = `${id}-list`;
        return (
          <>
            <Input
              id={id}
              data-testid={testId}
              list={listId}
              value={asString(value)}
              onChange={(e) => onChange(e.target.value)}
            />
            <datalist id={listId}>
              {options.map((opt) => (
                <option key={optionKey(opt.value)} value={optionKey(opt.value)}>
                  {resolveLabel(opt.label, i18n)}
                </option>
              ))}
            </datalist>
          </>
        );
      }
      default:
        return (
          <Input
            id={id}
            data-testid={testId}
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  })();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} id={labelId}>
        {label}
      </Label>
      {control}
    </div>
  );
}

// Block attr values are primitives in practice; coerce only the primitive
// kinds so a stray object can't stringify to "[object Object]".
function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// DOM control values are strings; key options by their stringified value so
// number/boolean options round-trip back to their typed form via decodeOption.
function optionKey(value: unknown): string {
  return asString(value);
}

function decodeOption(
  options: readonly BlockInputOption[],
  key: string,
): unknown {
  const match = options.find((opt) => optionKey(opt.value) === key);
  return match ? match.value : key;
}
