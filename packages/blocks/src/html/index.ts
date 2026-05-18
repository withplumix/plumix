import { defineBlock } from "../define-block.js";

export const htmlBlock = defineBlock({
  name: "core/html",
  title: "Custom HTML",
  icon: "CodeXml",
  category: "typography",
  description:
    "Raw HTML escape hatch. Author content is sanitized through the registry-derived allowlist before render — operators extend the allowlist via `defineApp({ blocks: { htmlAllowlist: {...} } })`.",
  schema: () => import("./schema.js").then((m) => m.htmlSchema),
  component: () => import("./Component.js").then((m) => m.HtmlComponent),
});
