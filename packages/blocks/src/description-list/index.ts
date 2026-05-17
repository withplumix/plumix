import { defineBlock } from "../define-block.js";

export const descriptionListBlock = defineBlock({
  name: "core/description-list",
  title: "Description list",
  category: "text",
  description: "Definition list of term / detail pairs.",
  schema: () => import("./schema.js").then((m) => m.descriptionListSchema),
  component: () =>
    import("./Component.js").then((m) => m.DescriptionListComponent),
});
