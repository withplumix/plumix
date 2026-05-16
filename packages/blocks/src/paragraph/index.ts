import { defineBlock } from "../define-block.js";

/**
 * Spec for the first core block. Lazy refs keep admin-only imports out
 * of the workers bundle and frontend-only renderers out of the admin
 * bundle. `legacyAliases: ["paragraph"]` lets the walker resolve
 * StarterKit-shaped content (entries authored before the namespaced
 * registry shipped) to this spec.
 */
export const paragraphBlock = defineBlock({
  name: "core/paragraph",
  title: "Paragraph",
  category: "text",
  description: "The building block of all narrative.",
  legacyAliases: ["paragraph"],
  schema: () => import("./schema.js").then((m) => m.paragraphSchema),
  component: () => import("./Component.js").then((m) => m.ParagraphComponent),
});
