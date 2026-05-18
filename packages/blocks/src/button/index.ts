import { defineBlock } from "../define-block.js";

const VARIANT_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "outline", label: "Outline" },
  { value: "ghost", label: "Ghost" },
] as const;

const SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] as const;

const TARGET_OPTIONS = [
  { value: "", label: "Same window" },
  { value: "_blank", label: "New window" },
] as const;

export const buttonBlock = defineBlock({
  name: "core/button",
  title: "Button",
  icon: "MousePointer",
  category: "interactive",
  description: "Call-to-action link styled as a button.",
  attributes: {
    text: { type: "text", label: "Label", default: "" },
    href: { type: "url", label: "Link target", default: "" },
    variant: {
      type: "select",
      label: "Variant",
      default: "primary",
      options: VARIANT_OPTIONS,
    },
    size: {
      type: "select",
      label: "Size",
      default: "md",
      options: SIZE_OPTIONS,
    },
    target: {
      type: "select",
      label: "Open in",
      default: "",
      options: TARGET_OPTIONS,
    },
  },
  supports: {
    color: { background: true, text: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.buttonSchema),
  component: () => import("./Component.js").then((m) => m.ButtonComponent),
});
