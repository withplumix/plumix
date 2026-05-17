import { defineBlock } from "../define-block.js";

export const descriptionDetailBlock = defineBlock({
  name: "core/description-detail",
  title: "Detail",
  category: "text",
  description: "Definition inside a description list.",
  schema: () => import("./schema.js").then((m) => m.descriptionDetailSchema),
  component: () =>
    import("./Component.js").then((m) => m.DescriptionDetailComponent),
});
