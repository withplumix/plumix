import { defineBlock } from "../define-block.js";

export const headingBlock = defineBlock({
  name: "core/heading",
  title: "Heading",
  category: "text",
  description: "Section title.",
  legacyAliases: ["heading"],
  schema: () => import("./schema.js").then((m) => m.headingSchema),
  component: () => import("./Component.js").then((m) => m.HeadingComponent),
});
