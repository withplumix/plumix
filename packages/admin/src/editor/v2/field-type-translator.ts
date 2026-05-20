import type { BlockInput } from "@plumix/blocks";
import type { Fields } from "@puckeditor/core";
import type { Extensions } from "@tiptap/core";

export interface TranslateFieldOptions {
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
  switch (input.type) {
    case "text":
    case "textarea":
    case "number":
      return { type: input.type, label: input.label };
    case "select":
    case "radio":
      return {
        type: input.type,
        label: input.label,
        options: (input.options ?? []).map((opt) => ({
          label: opt.label,
          value: opt.value,
        })),
      };
    case "slot":
      return { type: "slot", label: input.label };
    case "richtext":
      return {
        type: "richtext",
        label: input.label,
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
        label: input.label,
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      };
    default:
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn(
          `[plumix:admin] field-type-translator: unknown input type "${input.type}" — falling back to text. Register the type via ctx.registerFieldType or pick a Puck-native type.`,
        );
      }
      return { type: "text", label: input.label };
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
