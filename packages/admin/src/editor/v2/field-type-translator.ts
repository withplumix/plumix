import type { BlockInput } from "@plumix/blocks";
import type { Fields } from "@puckeditor/core";

export function translateField(
  input: BlockInput,
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
    default:
      return { type: "text", label: input.label };
  }
}

export function translateFields(
  inputs: readonly BlockInput[],
): Fields {
  const out: Record<string, Fields[string]> = {};
  for (const input of inputs) {
    out[input.name] = translateField(input);
  }
  return out;
}
