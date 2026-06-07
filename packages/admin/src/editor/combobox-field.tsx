import type { ReactNode } from "react";
import { useId } from "react";

interface ComboboxOption {
  readonly label: string;
  readonly value: string;
}

// Free-text input backed by a <datalist> of suggestions. Unlike Puck's
// native <select>, this preserves any stored string — including legacy
// free-text values not in the suggestion list — so existing content is
// never silently dropped (the reason the code block can't use a select).
export function ComboboxField({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  readonly label?: string;
  readonly value: unknown;
  readonly options: readonly ComboboxOption[];
  readonly onChange: (value: string) => void;
  readonly testId?: string;
}): ReactNode {
  const listId = useId();
  return (
    <label className="flex flex-col gap-2 text-sm">
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        list={listId}
        data-testid={testId}
        className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </datalist>
    </label>
  );
}
