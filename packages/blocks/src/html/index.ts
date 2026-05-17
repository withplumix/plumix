import { defineBlock } from "../define-block.js";

export const htmlBlock = defineBlock({
  name: "core/html",
  title: "Custom HTML",
  category: "typography",
  description:
    "Raw HTML escape hatch. Sanitisation lands in #312 — until then, do not enable in fields that accept unauthenticated input.",
  schema: () => import("./schema.js").then((m) => m.htmlSchema),
  component: () => import("./Component.js").then((m) => m.HtmlComponent),
});
