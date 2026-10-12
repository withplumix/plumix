import type { MetaBoxSiblingValues } from "@/lib/plugin-registry.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import type { ControllerRenderProps, FieldValues } from "react-hook-form";
import { lazy, Suspense, useState } from "react";
import { getPluginFieldType } from "@/lib/plugin-registry.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";

import type { JSONContent } from "@plumix/admin-editor/rich-text-field";
import type { JsonObject } from "@plumix/core";
import type {
  MetaBoxFieldManifestEntry,
  MetaBoxFieldSpan,
  RichtextMetaBoxField,
  TemporalInputType,
} from "@plumix/core/manifest";
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
import {
  InputGroupInput,
  InputGroupTextarea,
} from "@plumix/admin-ui/input-group";
import { RadioGroup, RadioGroupItem } from "@plumix/admin-ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Slider } from "@plumix/admin-ui/slider";
import { Switch } from "@plumix/admin-ui/switch";
import { Textarea } from "@plumix/admin-ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@plumix/admin-ui/toggle-group";
import { CANONICAL_INPUT_TYPES } from "@plumix/core/fields";

import type { LookupItem } from "./lookup/types.js";
import { AdornedControl } from "./adorned-control.js";
import {
  asString,
  decodeOptionValue,
  encodeOptionValue,
  htmlInputType,
  isAdorned,
  isBuiltinInputType,
  numberInputValue,
  orderedSelection,
  referenceValueId,
  referenceValueSummary,
  resetKeyFor,
  siblingBagName,
  temporalDisplayValue,
  temporalInputValue,
  toggleStateText,
} from "./field-values.js";
import { GroupField } from "./group-field.js";
import { evaluateJsonDraft, formatJsonDraft } from "./json-draft.js";
import { LinkField } from "./link-field.js";
import { MultiReferencePicker } from "./multi-reference-picker.js";
import { PluginFieldErrorBoundary } from "./plugin-field-error-boundary.js";
import { ReferencePicker } from "./reference-picker.js";
import { RepeaterField } from "./repeater-field.js";
import { useBagValues } from "./use-visible-fields.js";

/** Code-split so a form with no richtext field never pays for ProseMirror. */
const RichTextField = lazy(() =>
  import("@plumix/admin-editor/rich-text-field").then((m) => ({
    default: m.RichTextField,
  })),
);

/**
 * CodeMirror (JSON syntax highlighting) is likewise code-split — a form
 * with no json field never pulls the editor chunk.
 */
const JsonCodeEditor = lazy(() => import("./json-code-editor.js"));

const M = {
  invalidJson: defineMessage({
    id: "metaBox.field.json.invalid",
    message: "Invalid JSON",
  }),
  colorOpenPicker: defineMessage({
    id: "metaBox.field.color.openPicker",
    message: "Open color picker",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * Expects an ancestor `<Form>` provider; reading `control` from context keeps
 * this agnostic of the caller's TFieldValues generic.
 */
export function MetaBoxField({
  field,
  name,
  disabled = false,
  span,
}: {
  readonly field: MetaBoxFieldManifestEntry;
  readonly name: string;
  readonly disabled?: boolean;
  readonly span?: MetaBoxFieldSpan;
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
          // Label-above so the box lines up with text inputs sharing its grid
          // row.
          return (
            <FormItem span={span} data-testid={testIdPrefix}>
              <FormLabel>{labelText}</FormLabel>
              <div className="flex min-h-9 items-center gap-2">
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
              </div>
              {field.description ? (
                <FormDescription data-testid={`${testIdPrefix}-description`}>
                  {renderLabel(field.description)}
                </FormDescription>
              ) : null}
              <FormMessage data-testid={`${testIdPrefix}-error`} />
            </FormItem>
          );
        }

        if (field.inputType === "toggle") {
          // Label-above so the switch lines up with text inputs sharing its
          // grid row.
          const stateText = toggleStateText(field, rhf.value);
          return (
            <FormItem span={span} data-testid={testIdPrefix}>
              <FormLabel>{labelText}</FormLabel>
              <div className="flex min-h-9 items-center gap-2">
                <FormControl>
                  <Switch
                    name={rhf.name}
                    checked={rhf.value === true}
                    required={field.required}
                    disabled={disabled}
                    onBlur={rhf.onBlur}
                    onCheckedChange={rhf.onChange}
                    data-testid={inputTestId}
                  />
                </FormControl>
                {stateText ? (
                  <span
                    className="text-muted-foreground text-sm"
                    data-testid={`${inputTestId}-state`}
                  >
                    {renderLabel(stateText)}
                  </span>
                ) : null}
              </div>
              {field.description ? (
                <FormDescription data-testid={`${testIdPrefix}-description`}>
                  {renderLabel(field.description)}
                </FormDescription>
              ) : null}
              <FormMessage data-testid={`${testIdPrefix}-error`} />
            </FormItem>
          );
        }

        if (
          field.inputType === "select" &&
          field.multiple !== true &&
          (field.appearance ?? "select") === "select" &&
          getPluginFieldType(field.inputType) === undefined
        ) {
          // Radix Select needs <FormControl> wrapping the trigger (not the
          // Select root, which renders no DOM node) so the label/error/
          // aria-invalid wiring lands on a real element.
          return (
            <FormItem span={span} data-testid={testIdPrefix}>
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
              <FormMessage data-testid={`${testIdPrefix}-error`} />
            </FormItem>
          );
        }

        const adorned =
          isAdorned(field) && getPluginFieldType(field.inputType) === undefined;
        const control = (
          <FormControl>
            {renderNativeInput({
              field,
              rhf,
              disabled,
              testId: inputTestId,
              renderLabel,
              adorned,
            })}
          </FormControl>
        );
        return (
          <FormItem span={span} data-testid={testIdPrefix}>
            <FormLabel>{labelText}</FormLabel>
            {adorned ? (
              <AdornedControl
                field={field}
                testId={inputTestId}
                block={field.inputType === "textarea"}
              >
                {control}
              </AdornedControl>
            ) : (
              control
            )}
            {field.description ? (
              <FormDescription data-testid={`${testIdPrefix}-description`}>
                {renderLabel(field.description)}
              </FormDescription>
            ) : null}
            <FormMessage data-testid={`${testIdPrefix}-error`} />
          </FormItem>
        );
      }}
    />
  );
}

/**
 * A component so only the plugin branch subscribes to sibling values; built-in
 * inputs keep re-rendering one field per keystroke.
 */
function PluginFieldSlot({
  Renderer,
  field,
  rhf,
  disabled,
  testId,
}: {
  readonly Renderer: NonNullable<ReturnType<typeof getPluginFieldType>>;
  readonly field: MetaBoxFieldManifestEntry;
  readonly rhf: ControllerRenderProps<FieldValues, string>;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  return (
    <Renderer
      field={field}
      rhf={rhf}
      disabled={disabled}
      testId={testId}
      siblings={useSiblingValues(rhf.name)}
    />
  );
}

function useSiblingValues(name: string): MetaBoxSiblingValues | undefined {
  return useBagValues({ name: siblingBagName(name) });
}

/**
 * The shared inputs each native-field renderer needs. Every renderer must
 * return a single element so shadcn's `<FormControl>` (which uses Radix `Slot`)
 * can forward id / aria-describedby / aria-invalid onto it.
 */
interface NativeInputContext {
  field: MetaBoxFieldManifestEntry;
  rhf: ControllerRenderProps<FieldValues, string>;
  disabled: boolean;
  testId: string;
  renderLabel: ReturnType<typeof useLabel>;
  /** Sits inside an `AdornedControl`: emit the input-group control variant. */
  adorned: boolean;
}

/**
 * Identity / validation / test-hook attributes shared by the plain
 * `<Input>`/`<Textarea>`-backed field types.
 */
function nativeCommonProps({
  rhf,
  field,
  disabled,
  testId,
}: NativeInputContext) {
  return {
    name: rhf.name,
    ref: rhf.ref,
    required: field.required,
    disabled,
    onBlur: rhf.onBlur,
    "data-testid": testId,
  } as const;
}

/** A field's optional placeholder, resolved through the label formatter. */
function fieldPlaceholder({
  field,
  renderLabel,
}: NativeInputContext): string | undefined {
  return field.placeholder ? renderLabel(field.placeholder) : undefined;
}

function renderTextareaField(ctx: NativeInputContext): ReactNode {
  const { field, rhf } = ctx;
  const placeholderText = fieldPlaceholder(ctx);
  const Control = ctx.adorned ? InputGroupTextarea : Textarea;
  return (
    <Control
      {...nativeCommonProps(ctx)}
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

function renderNumberField(ctx: NativeInputContext): ReactNode {
  const { field, rhf } = ctx;
  const placeholderText = fieldPlaceholder(ctx);
  const Control = ctx.adorned ? InputGroupInput : Input;
  return (
    <Control
      {...nativeCommonProps(ctx)}
      type="number"
      value={asNumberInputValue(rhf.value)}
      placeholder={placeholderText}
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      onChange={(e) => {
        const next = numberInputValue(e.target.value);
        if (next !== undefined) rhf.onChange(next);
      }}
    />
  );
}

function renderColorField({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: NativeInputContext): ReactNode {
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
      triggerLabel={renderLabel(M.colorOpenPicker)}
    />
  );
}

function renderRangeField({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: NativeInputContext): ReactNode {
  const labelText = renderLabel(field.label);
  const num = Number(rhf.value);
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
        className="text-muted-foreground min-w-6 text-end text-sm tabular-nums"
        data-testid={`${testId}-display`}
      >
        {Number.isFinite(num) ? num : "–"}
      </span>
    </div>
  );
}

function renderRepeaterField({
  field,
  rhf,
  disabled,
  testId,
}: NativeInputContext): ReactNode {
  return (
    <RepeaterField
      field={field}
      rhf={rhf}
      disabled={disabled}
      testId={testId}
    />
  );
}

function renderGroupField({
  field,
  rhf,
  disabled,
  testId,
}: NativeInputContext): ReactNode {
  return (
    <GroupField
      field={field}
      name={rhf.name}
      disabled={disabled}
      testId={testId}
    />
  );
}

function renderLinkField({
  field,
  rhf,
  disabled,
  testId,
}: NativeInputContext): ReactNode {
  return (
    <LinkField field={field} rhf={rhf} disabled={disabled} testId={testId} />
  );
}

/**
 * The dropdown case never reaches here: Radix Select needs <FormControl>
 * around its trigger, so the FormField callback handles it.
 */
function renderSelectChoiceField(ctx: NativeInputContext): ReactNode {
  const { field } = ctx;
  if (field.multiple === true) {
    return field.appearance === "checkboxes"
      ? renderCheckboxListField(ctx)
      : renderMultiButtonsField(ctx);
  }
  return field.appearance === "radio"
    ? renderRadioField(ctx)
    : renderSingleButtonsField(ctx);
}

/**
 * Single-value toggle-button group — `appearance: "buttons"`. Radix
 * gives single-type items radio semantics (role=radio), matching the
 * control's one-of-many meaning.
 */
function renderSingleButtonsField({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: NativeInputContext): ReactNode {
  const labelText = renderLabel(field.label);
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={1}
      value={encodeOptionValue(asString(rhf.value))}
      disabled={disabled}
      onValueChange={(next) => {
        // Radix emits "" when the active item is clicked again
        // (deselect); a one-of-many control keeps its selection, like
        // a radio group.
        if (next !== "") rhf.onChange(decodeOptionValue(next));
      }}
      onBlur={rhf.onBlur}
      aria-label={labelText}
      data-testid={testId}
    >
      {(field.options ?? []).map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={encodeOptionValue(opt.value)}
          data-testid={`${testId}-${opt.value}`}
        >
          {renderLabel(opt.label)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Multi-value checkbox list — `appearance: "checkboxes"`. Selection
 * state lives in the value array; emitted arrays follow the declared
 * option order so storage stays stable regardless of click order.
 */
function renderCheckboxListField({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: NativeInputContext): ReactNode {
  const labelText = renderLabel(field.label);
  const selected = new Set(
    Array.isArray(rhf.value)
      ? rhf.value.filter((v): v is string => typeof v === "string")
      : [],
  );
  const options = field.options ?? [];
  return (
    <div
      role="group"
      aria-label={labelText}
      className="flex flex-col gap-1"
      data-testid={testId}
    >
      {options.map((opt) => (
        <div key={opt.value} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selected.has(opt.value)}
            disabled={disabled}
            onBlur={rhf.onBlur}
            onCheckedChange={(checked) => {
              const next = new Set(selected);
              if (checked === true) next.add(opt.value);
              else next.delete(opt.value);
              rhf.onChange(orderedSelection(options, next));
            }}
            id={`${testId}-${opt.value}`}
            data-testid={`${testId}-${opt.value}`}
          />
          <label htmlFor={`${testId}-${opt.value}`}>
            {renderLabel(opt.label)}
          </label>
        </div>
      ))}
    </div>
  );
}

function renderMultiButtonsField({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: NativeInputContext): ReactNode {
  const labelText = renderLabel(field.label);
  const options = field.options ?? [];
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
        // Radix reports click order.
        rhf.onChange(orderedSelection(options, next));
      }}
      onBlur={rhf.onBlur}
      aria-label={labelText}
      data-testid={testId}
    >
      {options.map((opt) => (
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

function renderJsonField({
  rhf,
  disabled,
  testId,
}: NativeInputContext): ReactNode {
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

function renderRichtextField({
  field,
  rhf,
  disabled,
  renderLabel,
}: NativeInputContext): ReactNode {
  const rt = field as RichtextMetaBoxField;
  const testId = `meta-box-field-${field.key}`;
  // A legacy string becomes an empty editor rather than being parsed as HTML.
  // Not parsed: the doc's shape is the editor schema's to state.
  const doc =
    rhf.value && typeof rhf.value === "object"
      ? (rhf.value as JSONContent)
      : null;
  return (
    <Suspense fallback={<RichTextFieldSkeleton testId={testId} />}>
      <RichTextField
        serialization="json"
        value={doc}
        onChange={rhf.onChange}
        disabled={disabled}
        ariaLabel={renderLabel(field.label)}
        allow={{ marks: rt.marks, nodes: rt.nodes }}
        testId={testId}
      />
    </Suspense>
  );
}

/**
 * Footprint-matching placeholder shown while the editor chunk loads, so the
 * form doesn't jump when Tiptap resolves.
 */
function RichTextFieldSkeleton({ testId }: { testId: string }): ReactNode {
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`${testId}-loading`}
      aria-busy="true"
    >
      <div className="bg-muted h-8 w-full animate-pulse rounded-md" />
      <div className="bg-muted h-32 w-full animate-pulse rounded-md" />
    </div>
  );
}

function renderDateTimeField(ctx: NativeInputContext): ReactNode {
  const { field, rhf } = ctx;
  return (
    <Input
      {...nativeCommonProps(ctx)}
      type={htmlInputType(field.inputType)}
      value={temporalDisplayValue(
        field.inputType as TemporalInputType,
        rhf.value,
      )}
      min={field.min}
      max={field.max}
      onChange={(e) => {
        rhf.onChange(temporalInputValue(e.target.value));
      }}
    />
  );
}

function renderRadioField({
  field,
  rhf,
  disabled,
  testId,
  renderLabel,
}: NativeInputContext): ReactNode {
  const labelText = renderLabel(field.label);
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
      aria-label={labelText}
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

function renderTextLikeField(ctx: NativeInputContext): ReactNode {
  const { field, rhf } = ctx;
  const placeholderText = fieldPlaceholder(ctx);
  if (!isBuiltinInputType(field.inputType)) {
    // A plugin-specific type falls back to text rather than crashing the
    // editor.
    console.warn(
      `[plumix] unknown meta-box field inputType "${field.inputType}" — falling back to text input. Register a custom renderer or use a built-in type (${CANONICAL_INPUT_TYPES.join("/")}).`,
    );
  }

  // Shared shape for `text` / `email` / `url` / `password` / unknown
  // fallback.
  const Control = ctx.adorned ? InputGroupInput : Input;
  return (
    <Control
      {...nativeCommonProps(ctx)}
      type={htmlInputType(field.inputType)}
      value={asString(rhf.value)}
      placeholder={placeholderText}
      maxLength={field.maxLength}
      onChange={(e) => {
        rhf.onChange(e.target.value);
      }}
    />
  );
}

type NativeInputRenderer = (ctx: NativeInputContext) => ReactNode;

/**
 * Dispatched before the reference branches, so a stray `referenceTarget` can't
 * turn these into a reference picker.
 */
const PRE_REFERENCE_RENDERERS: Partial<Record<string, NativeInputRenderer>> = {
  textarea: renderTextareaField,
  number: renderNumberField,
  color: renderColorField,
  range: renderRangeField,
  repeater: renderRepeaterField,
  group: renderGroupField,
};

/**
 * The bare `multiselect` / `radio` keys keep object-literal registrations of
 * the retired input types rendering.
 */
const POST_REFERENCE_RENDERERS: Partial<Record<string, NativeInputRenderer>> = {
  select: renderSelectChoiceField,
  multiselect: renderMultiButtonsField,
  json: renderJsonField,
  richtext: renderRichtextField,
  date: renderDateTimeField,
  datetime: renderDateTimeField,
  time: renderDateTimeField,
  radio: renderRadioField,
  link: renderLinkField,
};

function renderNativeInput(ctx: NativeInputContext): ReactNode {
  const { field, rhf, disabled, testId, renderLabel } = ctx;
  const labelText = renderLabel(field.label);

  // Plugin renderers win over built-ins; the boundary keeps a thrown render
  // from taking down the whole entry editor.
  const PluginRenderer = getPluginFieldType(field.inputType);
  if (PluginRenderer) {
    return (
      <PluginFieldErrorBoundary
        fieldKey={field.key}
        inputType={field.inputType}
        testId={testId}
        // A different value re-attempts instead of staying stuck on the
        // placeholder.
        resetKey={resetKeyFor(rhf.value)}
      >
        <PluginFieldSlot
          Renderer={PluginRenderer}
          field={field}
          rhf={rhf}
          disabled={disabled}
          testId={testId}
        />
      </PluginFieldErrorBoundary>
    );
  }

  const preReference = PRE_REFERENCE_RENDERERS[field.inputType];
  if (preReference) return preReference(ctx);

  if (field.referenceTarget?.multiple === true) {
    const rows = Array.isArray(rhf.value) ? rhf.value : [];
    const value = rows
      .map(referenceValueId)
      .filter((id): id is string => id !== null);
    const initialSelected = rows
      .map(referenceValueSummary)
      .filter((row): row is LookupItem => row !== null);
    return (
      <MultiReferencePicker
        value={value}
        onChange={(next) => {
          rhf.onChange(next);
        }}
        kind={field.referenceTarget.kind}
        scope={field.referenceTarget.scope as JsonObject | undefined}
        max={typeof field.max === "number" ? field.max : undefined}
        disabled={disabled}
        required={field.required}
        label={labelText}
        testId={testId}
        initialSelected={initialSelected}
      />
    );
  }

  if (
    field.referenceTarget &&
    (field.inputType === "user" ||
      field.inputType === "entry" ||
      field.inputType === "term")
  ) {
    const value = referenceValueId(rhf.value);
    return (
      <ReferencePicker
        value={value}
        onChange={(next) => {
          rhf.onChange(next);
        }}
        kind={field.referenceTarget.kind}
        scope={field.referenceTarget.scope as JsonObject | undefined}
        disabled={disabled}
        required={field.required}
        label={labelText}
        testId={testId}
        initialSelected={referenceValueSummary(rhf.value)}
      />
    );
  }

  const postReference = POST_REFERENCE_RENDERERS[field.inputType];
  if (postReference) return postReference(ctx);

  return renderTextLikeField(ctx);
}

/**
 * `<input type="number">` needs an empty string (not `0`) to render an
 * empty field, and a number-or-string for a valued field. Non-numeric
 * input drops to empty rather than rendering "NaN".
 */
function asNumberInputValue(value: unknown): number | string {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  return "";
}

/** The wire shape allows string bounds, though `range` is numeric-only. */
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

/**
 * A local draft lets the user type invalid intermediate JSON; only valid drafts
 * propagate.
 */
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
  const initialFormatted = formatJsonDraft(value);
  const [draft, setDraft] = useState(initialFormatted);
  const [error, setError] = useState<MessageDescriptor | null>(null);
  // Picks up external resyncs like `form.reset()`. setState during render is
  // React's sanctioned derive-from-props pattern.
  const [lastValueSnapshot, setLastValueSnapshot] = useState(initialFormatted);
  if (initialFormatted !== lastValueSnapshot) {
    setLastValueSnapshot(initialFormatted);
    setDraft(initialFormatted);
    setError(null);
  }

  // `onBlur` lives on the shell: CodeMirror has no single focusable input.
  const handleRaw = (raw: string): void => {
    setDraft(raw);
    const result = evaluateJsonDraft(raw);
    if (result.kind === "empty") {
      setError(null);
      onChange(null);
    } else if (result.kind === "value") {
      setError(null);
      onChange(result.value);
    } else {
      setError(M.invalidJson);
    }
  };

  return (
    <div
      className="flex flex-col gap-1"
      data-testid={`${testId}-shell`}
      onBlur={onBlur}
    >
      <Suspense fallback={<JsonEditorSkeleton testId={testId} />}>
        <JsonCodeEditor
          value={draft}
          onChange={handleRaw}
          disabled={disabled}
          ariaInvalid={error ? true : undefined}
          ariaLabel={name}
          testId={testId}
        />
      </Suspense>
      {error ? (
        <p className="text-destructive text-xs" data-testid={`${testId}-error`}>
          {labelFn(error)}
        </p>
      ) : null}
    </div>
  );
}

/** Footprint-matching placeholder while the CodeMirror chunk loads. */
function JsonEditorSkeleton({ testId }: { testId: string }): React.ReactNode {
  return (
    <div
      className="bg-muted h-32 w-full animate-pulse rounded-md"
      data-testid={`${testId}-loading`}
      aria-busy="true"
    />
  );
}
