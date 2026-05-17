import { defineBlock } from "../define-block.js";

export const descriptionTermBlock = defineBlock({
  name: "core/description-term",
  title: "Term",
  category: "text",
  description: "Term inside a description list.",
  schema: () => import("./schema.js").then((m) => m.descriptionTermSchema),
  component: () =>
    import("./Component.js").then((m) => m.DescriptionTermComponent),
});
