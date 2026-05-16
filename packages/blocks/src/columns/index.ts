import { defineBlock } from "../define-block.js";

export const columnsBlock = defineBlock({
  name: "core/columns",
  title: "Columns",
  category: "layout",
  description: "Multi-column container with explicit ratios.",
  schema: () => import("./schema.js").then((m) => m.columnsSchema),
  component: () => import("./Component.js").then((m) => m.ColumnsComponent),
});
