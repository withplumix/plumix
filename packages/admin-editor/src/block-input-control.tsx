import type { ReactElement } from "react";
import { createElement, lazy, Suspense, useId, useState } from "react";
import { useLingui } from "@lingui/react";

import type { BlockInput, BlockInputOption } from "@plumix/blocks";
import { Button } from "@plumix/admin-ui/button";
import { Checkbox } from "@plumix/admin-ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@plumix/admin-ui/command";
import { Field, FieldLabel } from "@plumix/admin-ui/field";
import { Check, ChevronsUpDown, Plus } from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@plumix/admin-ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Switch } from "@plumix/admin-ui/switch";
import { Textarea } from "@plumix/admin-ui/textarea";
import { cn } from "@plumix/admin-ui/utils";
import { resolveLabel } from "@plumix/core/i18n";

// Lazy so the Tiptap + ProseMirror engine (~230 KB) splits into its own chunk,
// fetched only when a rich-text block is selected.
const RichTextField = lazy(() =>
  import("./rich-text-field.js").then((m) => ({ default: m.RichTextField })),
);

/**
 * A plugin-supplied field control (e.g. the media picker), resolved by the host
 * from the same registry metaboxes use. The seam adapts a block attribute onto
 * the `rhf` shape these controls already expect, so one registration serves
 * both metaboxes and the block inspector. `field` is opaque here — the host's
 * control casts it to its own field-manifest type.
 */
export interface PluginFieldControlProps {
  readonly field: unknown;
  readonly rhf: {
    readonly value: unknown;
    readonly onChange: (value: unknown) => void;
    readonly onBlur: () => void;
    readonly name: string;
  };
  readonly disabled: boolean;
  readonly testId: string;
  /**
   * The rest of the active block's attributes (read-only). A few controls are
   * sibling-aware — the focal-point picker reads the block's image url to draw
   * its preview. Absent in the metabox context (fields there are independent).
   */
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export type PluginFieldControl = (
  props: PluginFieldControlProps,
) => ReactElement | null;

/**
 * Resolves an input type the built-in kinds don't handle to a host control.
 * Threaded from the app (which owns the plugin field registry) down to each
 * control, so this package stays decoupled from that registry.
 */
export type ResolvePluginFieldType = (
  type: string,
) => PluginFieldControl | undefined;

interface BlockInputControlProps {
  readonly input: BlockInput;
  readonly value: unknown;
  /** Emits the next typed value (string for text, number for number, etc.). */
  readonly onChange: (value: unknown) => void;
  readonly resolvePluginFieldType?: ResolvePluginFieldType;
  /** The active block's other attributes, forwarded to sibling-aware plugin
   *  controls (e.g. the focal-point picker reads the image url). */
  readonly attrs?: Readonly<Record<string, unknown>>;
}

// Block-attr edits commit on onChange; the block path has no RHF touched-state,
// so a plugin control's onBlur is inert here (kept to satisfy the shim shape).
const noop = (): void => undefined;

const FIELD_TESTID = (name: string): string => `block-input-${name}`;

/**
 * Renders one block attribute as an admin-ui form control, dispatching the
 * typed next value on edit. shadcn primitives throughout — select uses the
 * shadcn `Select`, round-tripping number/boolean option values through their
 * stringified `optionKey` (Radix is string-only); radio stays a native group.
 * Mirrors the kinds the Puck field translator supports so plugin blocks render
 * unchanged.
 */
export function BlockInputControl({
  input,
  value,
  onChange,
  resolvePluginFieldType,
  attrs,
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
          <Textarea
            id={id}
            data-testid={testId}
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
      case "boolean":
        return (
          <Switch
            id={id}
            data-testid={testId}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
        );
      case "select":
        return (
          <Select
            value={encodeSelectKey(value)}
            onValueChange={(next) =>
              onChange(decodeOption(options, decodeSelectKey(next)))
            }
          >
            <SelectTrigger id={id} data-testid={testId} className="w-full">
              <SelectValue
                placeholder={
                  input.placeholder
                    ? resolveLabel(input.placeholder, i18n)
                    : undefined
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem
                  key={optionKey(opt.value)}
                  value={encodeSelectKey(opt.value)}
                  data-testid={`${testId}-option-${optionKey(opt.value)}`}
                >
                  {resolveLabel(opt.label, i18n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      case "richtext":
        return (
          <Suspense fallback={<RichTextFieldSkeleton testId={testId} />}>
            <RichTextField
              value={asString(value)}
              onChange={onChange}
              testId={testId}
            />
          </Suspense>
        );
      case "combobox":
        return (
          <ComboboxControl
            id={id}
            testId={testId}
            value={value}
            options={options}
            onChange={onChange}
          />
        );
      default: {
        // A plugin may register a control for a type the built-ins don't
        // handle (the media picker). Fall through to plain text when nothing
        // is registered, preserving the prior behavior for stray types.
        const PluginField = resolvePluginFieldType?.(input.type);
        if (PluginField) {
          // createElement, not JSX: the component is resolved at runtime from a
          // prop, and the host caches its identity — render it directly.
          return createElement(PluginField, {
            field: input,
            rhf: { value, onChange, onBlur: noop, name: input.name },
            disabled: false,
            testId,
            attrs: attrs ?? {},
          });
        }
        return (
          <Input
            id={id}
            data-testid={testId}
            value={asString(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }
    }
  })();

  // Toggles read as one inline row — label left, control right — like the
  // Styles tab's Visibility switches; other kinds stack the label above.
  const inline = input.type === "boolean" || input.type === "checkbox";
  return (
    <Field
      orientation={inline ? "horizontal" : "vertical"}
      className={inline ? undefined : "gap-1.5"}
    >
      <FieldLabel htmlFor={id} id={labelId}>
        {label}
      </FieldLabel>
      {control}
    </Field>
  );
}

/**
 * Placeholder shown while the lazy `RichTextField` chunk loads. Mirrors the
 * field's footprint (toolbar row + content box + hint) so the panel doesn't
 * jump when the real editor swaps in. Pure skeleton — no copy, so no new i18n.
 */
function RichTextFieldSkeleton({
  testId,
}: {
  readonly testId: string;
}): ReactElement {
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`${testId}-loading`}
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center gap-0.5">
        {/* ~one placeholder per toolbar control (format + marks + lists +
            quote + link + clear) */}
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="bg-muted size-8 animate-pulse rounded-md" />
        ))}
      </div>
      <div className="border-input bg-muted/40 min-h-32 w-full animate-pulse rounded-md border" />
      <div className="bg-muted h-3 w-48 animate-pulse rounded" />
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

// A searchable dropdown that still accepts a free-typed value — a shadcn
// Command in a Popover, not a native `<datalist>` (which looks like a plain
// input and hides its options until you type). Selecting an option or the
// "use typed text" affordance commits; unknown/legacy values round-trip.
function ComboboxControl({
  id,
  testId,
  value,
  options,
  onChange,
}: {
  readonly id: string;
  readonly testId: string;
  readonly value: unknown;
  readonly options: readonly BlockInputOption[];
  readonly onChange: (value: unknown) => void;
}): ReactElement {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = asString(value);
  const selected = options.find((opt) => optionKey(opt.value) === current);
  const custom = query.trim();
  const canCreate =
    custom !== "" && !options.some((opt) => optionKey(opt.value) === custom);

  const commit = (next: unknown): void => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  // Known option → its label; a legacy/unknown value → the raw string; empty →
  // the placeholder.
  const triggerLabel = selected
    ? resolveLabel(selected.label, i18n)
    : current ||
      i18n._({ id: "editor.combobox.placeholder", message: "Select…" });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id={id}
          data-testid={testId}
          className={cn(
            "w-full justify-between font-normal",
            current === "" && "text-muted-foreground",
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={i18n._({
              id: "editor.combobox.search",
              message: "Search…",
            })}
            data-testid={`${testId}-search`}
          />
          <CommandList>
            {canCreate ? (
              <CommandItem
                value={custom}
                onSelect={() => commit(custom)}
                data-testid={`${testId}-create`}
              >
                <Plus className="me-2 size-4" />
                {custom}
              </CommandItem>
            ) : (
              <CommandEmpty>
                <span className="text-muted-foreground text-sm">
                  {i18n._({ id: "editor.combobox.none", message: "No match." })}
                </span>
              </CommandEmpty>
            )}
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={optionKey(opt.value)}
                  value={optionKey(opt.value)}
                  // cmdk filters on `value`; add the label so a search matches
                  // the display text too (e.g. "C++" for the `cpp` value).
                  keywords={[resolveLabel(opt.label, i18n)]}
                  onSelect={() => commit(opt.value)}
                  data-testid={`${testId}-option-${optionKey(opt.value)}`}
                >
                  {resolveLabel(opt.label, i18n)}
                  {optionKey(opt.value) === current ? (
                    <Check className="ms-auto size-4" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// DOM control values are strings; key options by their stringified value so
// number/boolean options round-trip back to their typed form via decodeOption.
function optionKey(value: unknown): string {
  return asString(value);
}

// Radix Select reserves "" for "no selection" and throws on an empty-string
// item value, but an option's stringified key can legitimately be "" (e.g. an
// empty-string value). Encode "" to a sentinel for the trigger + items and
// decode it back before resolving the typed option. (An option that stringifies
// to the sentinel itself would collide — vanishingly unlikely, as meta-box's
// equivalent also accepts.)
const SELECT_EMPTY = "__plumix_empty__";
function encodeSelectKey(value: unknown): string {
  // An unset value (no attr) maps to Radix's reserved "" — "no selection" — so
  // the trigger renders its placeholder. The sentinel is only for an *option*
  // whose own value stringifies to "", which must stay distinct from unset.
  if (value === undefined || value === null) return "";
  const key = optionKey(value);
  return key === "" ? SELECT_EMPTY : key;
}
function decodeSelectKey(key: string): string {
  return key === SELECT_EMPTY ? "" : key;
}

function decodeOption(
  options: readonly BlockInputOption[],
  key: string,
): unknown {
  const match = options.find((opt) => optionKey(opt.value) === key);
  return match ? match.value : key;
}
