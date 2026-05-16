import { defineBlock } from "../define-block.js";

export const columnBlock = defineBlock({
  name: "core/column",
  title: "Column",
  category: "layout",
  description: "Single column inside a columns container.",
  schema: () => import("./schema.js").then((m) => m.columnSchema),
  component: () => import("./Component.js").then((m) => m.ColumnComponent),
});
