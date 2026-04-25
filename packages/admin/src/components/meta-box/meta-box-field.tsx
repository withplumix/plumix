import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { cn } from "@/lib/utils";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

// Schema-driven field renderer wired to react-hook-form. Each meta-box
// field becomes a shadcn `FormField` under the supplied `name` path so
// label/description/error rendering + ARIA wiring match every other
// admin form surface. Expects an ancestor `<Form>` provider —
// Controller reads the form context for `control`, which keeps this
// component agnostic of the caller's TFieldValues generic.
//
// `className` lands on the outer FormItem so parent grids can push a
// col-span class onto it (see `metaBoxFieldColSpanClass`). Unknown
// `inputType` falls back to a plain text input with a dev-mode warning
// so a plugin-specific type doesn't crash the editor. Custom React
// renderers (plugin chunks) are a future extension seam — they slot in
// ahead of the built-in switch when chunk splitting lands.
export function MetaBoxField({
  field,
  name,
  disabled = false,
  className,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly name: string;
  readonly disabled?: boolean;
  readonly className?: string;
}): ReactNode {
  const testIdPrefix = `meta-box-field-${field.key}`;
  const inputTestId = `${testIdPrefix}-input`;

  return (
    <FormField
      name={name}
      render={({ field: rhf }) => {
        if (field.inputType === "checkbox") {
          // Checkboxes carry their label inline and skip the shared
          // label-above-input shell. `FormControl` still provides the
          // ARIA wiring + disabled state styling.
          return (
            <FormItem className={className} data-testid={testIdPrefix}>
              <div className="flex items-center gap-2">
                <FormControl>
                  <input
                    type="checkbox"
                    name={rhf.name}
                    ref={rhf.ref}
                    checked={rhf.value === true}
                    required={field.required}
                    disabled={disabled}
                    onBlur={rhf.onBlur}
                    onChange={(e) => {
                      rhf.onChange(e.target.checked);
                    }}
                    data-testid={inputTestId}
                  />
                </FormControl>
                <FormLabel>{field.label}</FormLabel>
              </div>
              {field.description ? (
                <FormDescription data-testid={`${testIdPrefix}-description`}>
                  {field.description}
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          );
        }

        return (
          <FormItem className={className} data-testid={testIdPrefix}>
            <FormLabel>{field.label}</FormLabel>
            <FormControl>
              {renderNativeInput({
                field,
                rhf,
                disabled,
                testId: inputTestId,
              })}
            </FormControl>
            {field.description ? (
              <FormDescription data-testid={`${testIdPrefix}-description`}>
                {field.description}
              </FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

// Base classes shared by <textarea> and <select> — mirror the shadcn
// <Input> look (same border, ring, disabled states) so all three line
// up visually in a dense sidebar.
const CONTROL_BASE_CLASS =
  "border-input bg-background focus-visible:ring-ring rounded-md border text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

// Returns the native-element body for the given field. Must render a
// single element so shadcn's `<FormControl>` (which uses Radix `Slot`)
// can forward id / aria-describedby / aria-invalid onto it.
function renderNativeInput({
  field,
  rhf,
  disabled,
  testId,
}: {
  field: MetaBoxFieldManifestEntry;
  rhf: ControllerRenderProps<FieldValues, string>;
  disabled: boolean;
  testId: string;
}): ReactNode {
  const common = {
    name: rhf.name,
    ref: rhf.ref,
    required: field.required,
    disabled,
    onBlur: rhf.onBlur,
    "data-testid": testId,
  } as const;

  if (field.inputType === "textarea") {
    return (
      <textarea
        {...common}
        value={asString(rhf.value)}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        rows={3}
        onChange={(e) => {
          rhf.onChange(e.target.value);
        }}
        className={cn(CONTROL_BASE_CLASS, "flex min-h-20 w-full px-3 py-2")}
      />
    );
  }

  if (field.inputType === "number") {
    return (
      <Input
        {...common}
        type="number"
        value={asNumberInputValue(rhf.value)}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            rhf.onChange(null);
            return;
          }
          // Native `<input type=number>` accepts partial input ("-",
          // "1e") which parses to NaN; guard so we never propagate NaN
          // into form state. User can keep typing — once the input is
          // a complete number the `isFinite` check passes.
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) rhf.onChange(parsed);
        }}
      />
    );
  }

  if (field.inputType === "select") {
    return (
      <select
        {...common}
        value={asString(rhf.value)}
        onChange={(e) => {
          rhf.onChange(e.target.value);
        }}
        className={cn(CONTROL_BASE_CLASS, "h-9 px-3 py-1")}
      >
        {(field.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.inputType === "radio") {
    return (
      <div
        role="radiogroup"
        className="flex flex-col gap-1"
        data-testid={testId}
      >
        {(field.options ?? []).map((opt) => (
          <label
            key={opt.value}
            className="inline-flex items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name={rhf.name}
              value={opt.value}
              checked={asString(rhf.value) === opt.value}
              required={field.required}
              disabled={disabled}
              onChange={() => {
                rhf.onChange(opt.value);
              }}
              data-testid={`${testId}-${opt.value}`}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  if (
    field.inputType !== "text" &&
    field.inputType !== "email" &&
    field.inputType !== "url"
  ) {
    // Forward-compat fallback: unknown inputType renders as a plain
    // text input so a plugin-specific type doesn't crash the editor.
    // Warn once per render so the plugin author sees the mismatch in
    // dev tools. A future `customRenderers` seam will hook in here
    // before the fallback.
    console.warn(
      `[plumix] unknown meta-box field inputType "${field.inputType}" — falling back to text input. Register a custom renderer or use a built-in type (text/textarea/number/email/url/select/radio/checkbox).`,
    );
  }

  // Shared shape for `text` / `email` / `url` / unknown fallback.
  const htmlType =
    field.inputType === "email" || field.inputType === "url"
      ? field.inputType
      : "text";
  return (
    <Input
      {...common}
      type={htmlType}
      value={asString(rhf.value)}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      onChange={(e) => {
        rhf.onChange(e.target.value);
      }}
    />
  );
}

// Tolerant coercion for inputs that display strings. Meta values
// arrive as `unknown` because the registry isn't per-type-generic yet;
// each input keeps the display-string stable regardless of what the
// server sent. `null` / `undefined` become empty strings.
function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

// `<input type="number">` needs an empty string (not `0`) to render an
// empty field, and a number-or-string for a valued field. Non-numeric
// input drops to empty rather than rendering "NaN".
function asNumberInputValue(value: unknown): number | string {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  return "";
}
