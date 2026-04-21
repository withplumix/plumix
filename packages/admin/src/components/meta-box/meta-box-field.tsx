import type { ReactNode } from "react";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

// Schema-driven field renderer. One dispatcher branch per built-in
// `inputType`; unknown types fall back to a plain text input with a
// dev-mode warning so a plugin-specific type doesn't crash the editor.
// Custom React renderers (plugin chunks) are a future extension seam —
// they'll slot in ahead of the built-in switch when chunk splitting lands.
export function MetaBoxField({
  field,
  value,
  onChange,
  disabled = false,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly value: unknown;
  readonly onChange: (next: unknown) => void;
  readonly disabled?: boolean;
}): ReactNode {
  const testIdPrefix = `meta-box-field-${field.key}`;
  return (
    <div className="flex flex-col gap-2" data-testid={testIdPrefix}>
      {field.inputType === "checkbox" ? (
        <InlineCheckbox
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          testId={`${testIdPrefix}-input`}
        />
      ) : (
        <>
          <Label id={labelId(field)} htmlFor={inputId(field)}>
            {field.label}
            <RequiredMarker show={field.required} />
          </Label>
          <FieldInput
            field={field}
            value={value}
            onChange={onChange}
            disabled={disabled}
            testId={`${testIdPrefix}-input`}
          />
        </>
      )}
      {field.description ? (
        <p
          id={descriptionId(field)}
          className="text-muted-foreground text-xs"
          data-testid={`${testIdPrefix}-description`}
        >
          {field.description}
        </p>
      ) : null}
    </div>
  );
}

function RequiredMarker({ show }: { show: boolean | undefined }): ReactNode {
  if (!show) return null;
  return (
    <span aria-hidden className="text-destructive ml-0.5">
      *
    </span>
  );
}

// Base classes shared by <textarea> and <select> — mirror the shadcn
// <Input> look (same border, ring, disabled states) so all three line up
// visually in a dense sidebar.
const CONTROL_BASE_CLASS =
  "border-input bg-background focus-visible:ring-ring rounded-md border text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function inputId(field: MetaBoxFieldManifestEntry): string {
  return `meta-${field.key}`;
}

function labelId(field: MetaBoxFieldManifestEntry): string {
  return `meta-${field.key}-label`;
}

function descriptionId(field: MetaBoxFieldManifestEntry): string {
  return `meta-${field.key}-description`;
}

// Dispatcher for everything except `checkbox`, which renders its label
// inline and doesn't share this label/input/description shell.
function FieldInput({
  field,
  value,
  onChange,
  disabled,
  testId,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly value: unknown;
  readonly onChange: (next: unknown) => void;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  const common = {
    id: inputId(field),
    name: field.key,
    required: field.required,
    disabled,
    "aria-describedby": field.description ? descriptionId(field) : undefined,
    "data-testid": testId,
  } as const;

  if (field.inputType === "textarea") {
    return (
      <textarea
        {...common}
        value={asString(value)}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        rows={3}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={`${CONTROL_BASE_CLASS} flex min-h-20 w-full px-3 py-2`}
      />
    );
  }

  if (field.inputType === "number") {
    return (
      <Input
        {...common}
        type="number"
        value={asNumberInputValue(value)}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          // Native `<input type=number>` accepts partial input ("-", "1e")
          // which parses to NaN; guard so we never propagate NaN into the
          // form's meta bag. User can keep typing — once the input is a
          // complete number the `isFinite` check passes.
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    );
  }

  if (field.inputType === "select") {
    return (
      <select
        {...common}
        value={asString(value)}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={`${CONTROL_BASE_CLASS} h-9 px-3 py-1`}
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
        aria-labelledby={labelId(field)}
        aria-describedby={field.description ? descriptionId(field) : undefined}
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
              name={field.key}
              value={opt.value}
              checked={asString(value) === opt.value}
              required={field.required}
              disabled={disabled}
              onChange={() => {
                onChange(opt.value);
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
    // Forward-compat fallback: unknown inputType renders as a plain text
    // input so a plugin-specific type doesn't crash the editor. Warn once
    // per render so the plugin author sees the mismatch in dev tools.
    // A future `customRenderers` seam will hook in here before the fallback.
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
      value={asString(value)}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}

function InlineCheckbox({
  field,
  value,
  onChange,
  disabled,
  testId,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly value: unknown;
  readonly onChange: (next: unknown) => void;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        id={inputId(field)}
        name={field.key}
        checked={value === true}
        required={field.required}
        disabled={disabled}
        aria-describedby={field.description ? descriptionId(field) : undefined}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        data-testid={testId}
      />
      {field.label}
      <RequiredMarker show={field.required} />
    </label>
  );
}

// Tolerant coercion for inputs that display strings. Meta values arrive
// as `unknown` because the registry isn't per-type-generic yet; each
// input keeps the display-string stable regardless of what the server
// sent. `null` / `undefined` become empty strings.
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
