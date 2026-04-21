import type { ReactNode } from "react";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

import type { SettingsFieldManifestEntry } from "@plumix/core/manifest";

/**
 * Dispatcher for a single settings field. Narrow on `field.type` so the
 * TypeScript compiler flags an unhandled case the moment we widen the
 * `SettingsFieldType` union in core. Contrast with `MetaBoxField` which
 * accepts a free-form `inputType: string` with a dispatcher fallback —
 * settings are core infrastructure where widening the union is a
 * core-team call, so the exhaustive switch is worth the rigidity.
 *
 * Consumers wire the field into TanStack Form via `value` + `onChange`;
 * validation + dirty tracking happen at the form level. ARIA dance
 * (label/input association, `aria-describedby` for `field.description`)
 * is encapsulated here so every settings form behaves identically.
 */
export function SettingsField({
  field,
  value,
  onChange,
  disabled,
  testId,
}: {
  readonly field: SettingsFieldManifestEntry;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly testId?: string;
}): ReactNode {
  const inputId = `setting-${field.name}`;
  const descriptionId = field.description ? `${inputId}-desc` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{field.label}</Label>
      {field.type === "text" ? (
        <Input
          id={inputId}
          name={field.name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          disabled={disabled}
          aria-describedby={descriptionId}
          data-testid={testId}
        />
      ) : (
        <textarea
          id={inputId}
          name={field.name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          disabled={disabled}
          aria-describedby={descriptionId}
          data-testid={testId}
          rows={4}
          className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}
      {field.description ? (
        <p id={descriptionId} className="text-muted-foreground text-xs">
          {field.description}
        </p>
      ) : null}
    </div>
  );
}
