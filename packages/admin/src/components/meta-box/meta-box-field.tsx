import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { useState } from "react";
import { ColorPicker } from "@/components/ui/color-picker.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { Slider } from "@/components/ui/slider.js";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.js";
import { cn } from "@/lib/utils";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";

import { MultiReferencePicker } from "./multi-reference-picker.js";
import { ReferencePicker } from "./reference-picker.js";

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

  if (field.inputType === "color") {
    return (
      <ColorPicker
        value={asString(rhf.value)}
        onChange={(next) => {
          rhf.onChange(next);
        }}
        disabled={disabled}
        required={field.required}
        name={rhf.name}
        testId={testId}
      />
    );
  }

  if (field.inputType === "range") {
    const num = typeof rhf.value === "number" ? rhf.value : Number(rhf.value);
    const minNum = toFiniteNumber(field.min, 0);
    const maxNum = toFiniteNumber(field.max, 100);
    const sliderValue = Number.isFinite(num) ? num : minNum;
    return (
      <div className="flex items-center gap-3" data-testid={testId}>
        <Slider
          name={rhf.name}
          min={minNum}
          max={maxNum}
          step={field.step ?? 1}
          value={[sliderValue]}
          disabled={disabled}
          onValueChange={(values) => {
            const next = values[0];
            if (typeof next === "number" && Number.isFinite(next)) {
              rhf.onChange(next);
            }
          }}
          onBlur={rhf.onBlur}
          aria-label={field.label}
          aria-required={field.required}
          data-testid={`${testId}-slider`}
          className="flex-1"
        />
        <span
          className="text-muted-foreground min-w-[3ch] text-right text-sm tabular-nums"
          data-testid={`${testId}-display`}
        >
          {Number.isFinite(num) ? num : "–"}
        </span>
      </div>
    );
  }

  if (field.referenceTarget?.multiple === true) {
    const value = Array.isArray(rhf.value)
      ? rhf.value.filter((v): v is string => typeof v === "string")
      : [];
    return (
      <MultiReferencePicker
        value={value}
        onChange={(next) => {
          rhf.onChange(next);
        }}
        kind={field.referenceTarget.kind}
        scope={
          field.referenceTarget.scope as Record<string, unknown> | undefined
        }
        max={typeof field.max === "number" ? field.max : undefined}
        disabled={disabled}
        required={field.required}
        label={field.label}
        testId={testId}
      />
    );
  }

  if (
    field.referenceTarget &&
    (field.inputType === "user" ||
      field.inputType === "entry" ||
      field.inputType === "term")
  ) {
    const value =
      typeof rhf.value === "string" && rhf.value !== "" ? rhf.value : null;
    return (
      <ReferencePicker
        value={value}
        onChange={(next) => {
          rhf.onChange(next);
        }}
        kind={field.referenceTarget.kind}
        scope={
          field.referenceTarget.scope as Record<string, unknown> | undefined
        }
        disabled={disabled}
        required={field.required}
        label={field.label}
        testId={testId}
      />
    );
  }

  if (field.inputType === "multiselect") {
    const selected = Array.isArray(rhf.value)
      ? rhf.value.filter((v): v is string => typeof v === "string")
      : [];
    return (
      <ToggleGroup
        type="multiple"
        variant="outline"
        spacing={1}
        value={selected}
        disabled={disabled}
        onValueChange={(next) => {
          rhf.onChange(next);
        }}
        onBlur={rhf.onBlur}
        aria-label={field.label}
        data-testid={testId}
      >
        {(field.options ?? []).map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            data-testid={`${testId}-${opt.value}`}
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  }

  if (field.inputType === "json") {
    return (
      <JsonControl
        value={rhf.value as unknown}
        onChange={rhf.onChange}
        onBlur={rhf.onBlur}
        name={rhf.name}
        disabled={disabled}
        testId={testId}
      />
    );
  }

  if (
    field.inputType === "date" ||
    field.inputType === "datetime" ||
    field.inputType === "time"
  ) {
    // Native HTML5 date / datetime-local / time inputs. They emit
    // ISO-shaped strings (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, `HH:MM`)
    // which Plumix stores as-is; consumers parse via `parseMetaDate`
    // when they need a JS `Date`. A future iteration may swap in the
    // shadcn `Calendar` primitive without changing the field-type
    // contract.
    const htmlType =
      field.inputType === "datetime" ? "datetime-local" : field.inputType;
    return (
      <Input
        {...common}
        type={htmlType}
        value={asString(rhf.value)}
        min={field.min}
        max={field.max}
        onChange={(e) => {
          const raw = e.target.value;
          rhf.onChange(raw === "" ? null : raw);
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
    field.inputType !== "url" &&
    field.inputType !== "password"
  ) {
    // Forward-compat fallback: unknown inputType renders as a plain
    // text input so a plugin-specific type doesn't crash the editor.
    // Warn once per render so the plugin author sees the mismatch in
    // dev tools. A future `customRenderers` seam will hook in here
    // before the fallback.
    console.warn(
      `[plumix] unknown meta-box field inputType "${field.inputType}" — falling back to text input. Register a custom renderer or use a built-in type (text/textarea/number/email/url/password/date/datetime/time/color/range/multiselect/json/user/userList/entry/entryList/term/termList/select/radio/checkbox).`,
    );
  }

  // Shared shape for `text` / `email` / `url` / `password` / unknown
  // fallback. The native `type` attribute drives both browser
  // validation (email / url) and visual masking (password).
  const htmlType =
    field.inputType === "email" ||
    field.inputType === "url" ||
    field.inputType === "password"
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

// Coerce a manifest min/max bound (which the wire shape carries as
// `number | string | undefined`) to a finite number suitable for the
// slider's `min`/`max` props. Unset bounds fall back to the supplied
// default. ISO-string bounds shouldn't reach this branch — `range`
// is numeric-only — but the cast makes it impossible to surface
// `string` to a `number`-only prop.
function toFiniteNumber(
  value: number | string | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// JSON field renderer. Holds a local "draft" string so the user can
// type intermediate state without re-stringifying form state on every
// keystroke; valid drafts propagate the parsed value upward, invalid
// drafts surface a parse error inline and leave the previous valid
// form value untouched. An empty draft is treated as `null`.
function JsonControl({
  value,
  onChange,
  onBlur,
  name,
  disabled,
  testId,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
  name: string;
  disabled: boolean;
  testId: string;
}): React.ReactNode {
  const initialFormatted = formatInitial(value);
  const [draft, setDraft] = useState(initialFormatted);
  const [error, setError] = useState<string | null>(null);
  // Detect external resyncs (e.g. `form.reset()` post-save) by
  // comparing the formatted shape of the incoming `value` against
  // a state-tracked snapshot. State-during-render is React's
  // sanctioned pattern for "deriving state from props" — setState
  // here is a no-op when nothing changed, so it doesn't loop.
  const [lastValueSnapshot, setLastValueSnapshot] = useState(initialFormatted);
  if (initialFormatted !== lastValueSnapshot) {
    setLastValueSnapshot(initialFormatted);
    setDraft(initialFormatted);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-1" data-testid={`${testId}-shell`}>
      <textarea
        name={name}
        value={draft}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw.trim() === "") {
            setError(null);
            onChange(null);
            return;
          }
          try {
            const parsed: unknown = JSON.parse(raw);
            setError(null);
            onChange(parsed);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON");
          }
        }}
        rows={6}
        spellCheck={false}
        data-testid={testId}
        className={cn(
          CONTROL_BASE_CLASS,
          "min-h-32 w-full px-3 py-2 font-mono text-xs",
          error ? "border-destructive" : "",
        )}
      />
      {error ? (
        <p className="text-destructive text-xs" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatInitial(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
