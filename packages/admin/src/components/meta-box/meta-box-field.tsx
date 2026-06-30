import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { useState } from "react";
import { getPluginFieldType } from "@/lib/plugin-registry.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Checkbox } from "@plumix/admin-ui/checkbox";
import { ColorPicker } from "@plumix/admin-ui/color-picker";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plumix/admin-ui/form";
import { Input } from "@plumix/admin-ui/input";
import { RadioGroup, RadioGroupItem } from "@plumix/admin-ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Slider } from "@plumix/admin-ui/slider";
import { Textarea } from "@plumix/admin-ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@plumix/admin-ui/toggle-group";

import { MultiReferencePicker } from "./multi-reference-picker.js";
import { PluginFieldErrorBoundary } from "./plugin-field-error-boundary.js";
import { ReferencePicker } from "./reference-picker.js";
import { RepeaterField } from "./repeater-field.js";

const M = {
  invalidJson: defineMessage({
    id: "metaBox.field.json.invalid",
    message: "Invalid JSON",
  }),
} satisfies Record<string, MessageDescriptor>;

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
  const renderLabel = useLabel();
  const labelText = renderLabel(field.label);
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
                  <Checkbox
                    name={rhf.name}
                    checked={rhf.value === true}
                    required={field.required}
                    disabled={disabled}
                    onBlur={rhf.onBlur}
                    onCheckedChange={(checked) => {
                      rhf.onChange(checked === true);
                    }}
                    data-testid={inputTestId}
                  />
                </FormControl>
                <FormLabel>{labelText}</FormLabel>
              </div>
              {field.description ? (
                <FormDescription data-testid={`${testIdPrefix}-description`}>
                  {renderLabel(field.description)}
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          );
        }

        if (
          field.inputType === "select" &&
          getPluginFieldType(field.inputType) === undefined
        ) {
          // Radix Select needs <FormControl> wrapping the trigger (not the
          // Select root, which renders no DOM node) so the label/error/
          // aria-invalid wiring lands on a real element.
          return (
            <FormItem className={className} data-testid={testIdPrefix}>
              <FormLabel>{labelText}</FormLabel>
              <Select
                name={rhf.name}
                value={encodeOptionValue(asString(rhf.value))}
                onValueChange={(next) => {
                  rhf.onChange(decodeOptionValue(next));
                }}
                disabled={disabled}
                required={field.required}
              >
                <FormControl>
                  <SelectTrigger
                    className="w-full"
                    onBlur={rhf.onBlur}
                    data-testid={inputTestId}
                  >
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={encodeOptionValue(opt.value)}
                      data-testid={`${inputTestId}-option-${opt.value}`}
                    >
                      {renderLabel(opt.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.description ? (
                <FormDescription data-testid={`${testIdPrefix}-description`}>
                  {renderLabel(field.description)}
                </FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          );
        }

        return (
          <FormItem className={className} data-testid={testIdPrefix}>
            <FormLabel>{labelText}</FormLabel>
            <FormControl>
              {renderNativeInput({
                field,
                rhf,
                disabled,
                testId: inputTestId,
                renderLabel,
              })}
            </FormControl>
            {field.description ? (
              <FormDescription data-testid={`${testIdPrefix}-description`}>
                {renderLabel(field.description)}
              </FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

// Radix Select / RadioGroup reject an empty-string item value (Radix reserves
// it for "no selection"), but a plugin author may legitimately register an
// option whose value is "". Encode "" to a sentinel for the item + selected
// value and decode it back on change so author data round-trips intact.
const EMPTY_OPTION_VALUE = "__plumix_empty__";
function encodeOptionValue(value: string): string {
  return value === "" ? EMPTY_OPTION_VALUE : value;
}
function decodeOptionValue(value: string): string {
  return value === EMPTY_OPTION_VALUE ? "" : value;
}

// Returns the native-element body for the given field. Must render a
// single element so shadcn's `<FormControl>` (which uses Radix `Slot`)
// can forward id / aria-describedby / aria-invalid onto it.
function renderNativeInput({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: {
  field: MetaBoxFieldManifestEntry;
  rhf: ControllerRenderProps<FieldValues, string>;
  disabled: boolean;
  testId: string;
  renderLabel: ReturnType<typeof useLabel>;
}): ReactNode {
  const labelText = renderLabel(field.label);
  const placeholderText = field.placeholder
    ? renderLabel(field.placeholder)
    : undefined;
  // Plugin-supplied field renderers slot in here, BEFORE the built-in
  // switch. A plugin's admin chunk calls `window.plumix.
  // registerPluginFieldType(inputType, Component)` at module load —
  // this dispatch consults the registry on every render. Wrapped in
  // `PluginFieldErrorBoundary` so a thrown render doesn't take down
  // the whole entry editor; the boundary surfaces a static "couldn't
  // render" placeholder and logs to the dev console.
  const PluginRenderer = getPluginFieldType(field.inputType);
  if (PluginRenderer) {
    return (
      <PluginFieldErrorBoundary
        fieldKey={field.key}
        inputType={field.inputType}
        testId={testId}
        // Resetting on value change lets the boundary recover after a
        // bad render — a user who picks a different (valid) value
        // re-attempts instead of staying stuck on the placeholder.
        // String coercion handles both bare-id (string) and cached-
        // object (object) shapes via JSON.stringify.
        resetKey={stringifyForResetKey(rhf.value)}
      >
        <PluginRenderer
          field={field}
          rhf={rhf}
          disabled={disabled}
          testId={testId}
        />
      </PluginFieldErrorBoundary>
    );
  }

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
      <Textarea
        {...common}
        value={asString(rhf.value)}
        maxLength={field.maxLength}
        placeholder={placeholderText}
        rows={3}
        onChange={(e) => {
          rhf.onChange(e.target.value);
        }}
        className="min-h-20"
      />
    );
  }

  if (field.inputType === "number") {
    return (
      <Input
        {...common}
        type="number"
        value={asNumberInputValue(rhf.value)}
        placeholder={placeholderText}
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
          aria-label={labelText}
          aria-required={field.required}
          data-testid={`${testId}-slider`}
          className="flex-1"
        />
        <span
          className="text-muted-foreground min-w-[3ch] text-end text-sm tabular-nums"
          data-testid={`${testId}-display`}
        >
          {Number.isFinite(num) ? num : "–"}
        </span>
      </div>
    );
  }

  if (field.inputType === "repeater") {
    // Repeater check ahead of reference-target branches: a hand-rolled
    // manifest literal that smuggled both `inputType: "repeater"` and
    // `referenceTarget` would otherwise route to MultiReferencePicker.
    return (
      <RepeaterField
        field={field}
        rhf={rhf}
        disabled={disabled}
        testId={testId}
      />
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
        label={labelText}
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
        label={labelText}
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
        aria-label={labelText}
        data-testid={testId}
      >
        {(field.options ?? []).map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            data-testid={`${testId}-${opt.value}`}
          >
            {renderLabel(opt.label)}
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

  if (field.inputType === "richtext") {
    // Standalone richtext outside a block input has no host today — the
    // richtext surface lives only inside block inputs. Surfacing it inside
    // a metabox needs a separate Tiptap host slice; until that lands, the
    // field falls back to a JSON textarea so the value is at least authorable.
    return (
      <Textarea
        className="font-mono text-xs"
        value={
          typeof rhf.value === "string" ? rhf.value : JSON.stringify(rhf.value)
        }
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          rhf.onChange(e.target.value)
        }
        disabled={disabled}
        aria-label={labelText}
        data-testid={`meta-box-field-${field.key}-input`}
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

  // Note: `select` is handled in the FormField render callback (it needs
  // <FormControl> around the Radix trigger, not the Select root).

  if (field.inputType === "radio") {
    return (
      <RadioGroup
        name={rhf.name}
        value={encodeOptionValue(asString(rhf.value))}
        onValueChange={(next) => {
          rhf.onChange(decodeOptionValue(next));
        }}
        onBlur={rhf.onBlur}
        disabled={disabled}
        required={field.required}
        className="gap-1"
        data-testid={testId}
      >
        {(field.options ?? []).map((opt) => (
          <div key={opt.value} className="flex items-center gap-2 text-sm">
            <RadioGroupItem
              value={encodeOptionValue(opt.value)}
              id={`${testId}-${opt.value}`}
              data-testid={`${testId}-${opt.value}`}
            />
            <label htmlFor={`${testId}-${opt.value}`}>
              {renderLabel(opt.label)}
            </label>
          </div>
        ))}
      </RadioGroup>
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
      `[plumix] unknown meta-box field inputType "${field.inputType}" — falling back to text input. Register a custom renderer or use a built-in type (text/textarea/number/email/url/password/date/datetime/time/color/range/multiselect/json/richtext/repeater/user/userList/entry/entryList/term/termList/select/radio/checkbox).`,
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
      placeholder={placeholderText}
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
  const labelFn = useLabel();
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
      <Textarea
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
            setError(
              err instanceof Error ? err.message : labelFn(M.invalidJson),
            );
          }
        }}
        rows={6}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        data-testid={testId}
        className="min-h-32 font-mono text-xs"
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

// Stable string for the error boundary's `resetKey`. Bare-id (string)
// values pass through; object/array values JSON-stringify; primitives
// coerce. Cycles or BigInts (very rare for meta values) fall back to
// a constant — the boundary just won't reset on those, which is fine.
function stringifyForResetKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "__unserializable__";
  }
}
