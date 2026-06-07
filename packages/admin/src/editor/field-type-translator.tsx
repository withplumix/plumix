import type { Fields } from "@puckeditor/core";
import type { Extensions } from "@tiptap/core";
import { i18n } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { BlockInput } from "@plumix/blocks";
import { resolveLabel } from "@plumix/core/i18n";

import { ComboboxField } from "./combobox-field.js";

const YES_LABEL = defineMessage({
  id: "fieldTypes.boolean.yes",
  message: "Yes",
});
const NO_LABEL = defineMessage({
  id: "fieldTypes.boolean.no",
  message: "No",
});

interface TranslateFieldOptions {
  // Extra Tiptap mark / node extensions to inject into any `richtext`
  // field. Plumix-specific marks (kbd, abbr, cite, small, sub, sup,
  // highlight) live here; Puck's bundled Tiptap covers bold / italic
  // / strike / code / link / underline via its built-in `options`.
  readonly richtextExtensions?: Extensions;
}

export function translateField(
  input: BlockInput,
  options: TranslateFieldOptions = {},
): Fields[string] {
  // Puck's Fields shape is `label: string`. Resolve at adapter-
  // construction time (per route-module evaluation) — `language-card.tsx`
  // calls `window.location.reload()` on locale change, reseating the
  // route module and re-resolving every label.
  const label = input.label ? resolveLabel(input.label, i18n) : undefined;
  switch (input.type) {
    case "text":
    case "textarea":
    case "number":
      return { type: input.type, label };
    case "select":
    case "radio":
      return {
        type: input.type,
        label,
        options: (input.options ?? []).map((opt) => ({
          label: resolveLabel(opt.label, i18n),
          value: opt.value,
        })),
      };
    case "combobox": {
      // Free-text + suggestions. Native select would drop any stored
      // value not in `options` (e.g. legacy free-text), so a custom
      // field backs it with a <datalist> instead.
      // String-coerce values (unlike select, which keeps raw
      // string|number|boolean) — a datalist + text input is string-only.
      const comboOptions = (input.options ?? []).map((opt) => ({
        label: resolveLabel(opt.label, i18n),
        value: String(opt.value),
      }));
      return {
        type: "custom",
        label,
        render: ({ value, onChange }) => (
          <ComboboxField
            label={label}
            value={value as unknown}
            options={comboOptions}
            onChange={(next: string) => {
              onChange(next);
            }}
            testId={`block-combobox-${input.name}`}
          />
        ),
      };
    }
    case "slot":
      return { type: "slot", label };
    case "richtext":
      return {
        type: "richtext",
        label,
        // contentEditable: true lets authors type directly on the canvas
        // (Puck's inline-edit mode); without it the field is sidebar-only,
        // which is the wrong UX for a paragraph body.
        contentEditable: true,
        ...(options.richtextExtensions
          ? { tiptap: { extensions: options.richtextExtensions } }
          : {}),
      };
    case "checkbox":
      // Puck has no native checkbox; surface a radio with true/false options
      // so the editor produces booleans rather than silently downgrading to a
      // text input that returns strings the block's `=== true` check rejects.
      return {
        type: "radio",
        label,
        options: [
          { label: i18n._(YES_LABEL), value: true },
          { label: i18n._(NO_LABEL), value: false },
        ],
      };
    default:
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV !== "production"
      ) {
        console.warn(
          `[plumix:admin] field-type-translator: unknown input type "${input.type}" — falling back to text. Register the type via ctx.registerFieldType or pick a Puck-native type.`,
        );
      }
      return { type: "text", label };
  }
}

export function translateFields(
  inputs: readonly BlockInput[],
  options: TranslateFieldOptions = {},
): Fields {
  const out: Record<string, Fields[string]> = {};
  for (const input of inputs) {
    out[input.name] = translateField(input, options);
  }
  return out;
}
