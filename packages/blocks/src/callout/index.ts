import { defineBlock } from "../define-block.js";

const VARIANT_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "warn", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "success", label: "Success" },
  { value: "note", label: "Note" },
] as const;

export const calloutBlock = defineBlock({
  name: "core/callout",
  title: "Callout",
  icon: "Info",
  category: "interactive",
  description: "Highlighted aside for info / warning / error / success / note.",
  attributes: {
    variant: {
      type: "select",
      label: "Variant",
      default: "info",
      options: VARIANT_OPTIONS,
    },
    icon: { type: "text", label: "Lucide icon name", default: "" },
  },
  supports: {
    color: { background: true, text: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.calloutSchema),
  component: () => import("./Component.js").then((m) => m.CalloutComponent),
});
