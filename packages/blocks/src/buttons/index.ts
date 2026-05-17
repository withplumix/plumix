import { defineBlock } from "../define-block.js";

const ALIGN_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Centre" },
  { value: "end", label: "End" },
  { value: "between", label: "Space between" },
] as const;

export const buttonsBlock = defineBlock({
  name: "core/buttons",
  title: "Buttons",
  category: "interactive",
  description: "Container for a row of call-to-action buttons.",
  attributes: {
    align: {
      type: "select",
      label: "Alignment",
      default: "start",
      options: ALIGN_OPTIONS,
    },
    gap: { type: "text", label: "Gap", default: "" },
  },
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.buttonsSchema),
  component: () => import("./Component.js").then((m) => m.ButtonsComponent),
});
