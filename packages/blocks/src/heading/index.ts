import { defineBlock } from "../define-block.js";

export const headingBlock = defineBlock({
  name: "core/heading",
  title: "Heading",
  category: "text",
  description: "Section title.",
  legacyAliases: ["heading"],
  attributes: {
    level: {
      type: "select",
      label: "Heading level",
      default: 2,
      options: [
        { value: 1, label: "H1" },
        { value: 2, label: "H2" },
        { value: 3, label: "H3" },
        { value: 4, label: "H4" },
        { value: 5, label: "H5" },
        { value: 6, label: "H6" },
      ],
    },
  },
  schema: () => import("./schema.js").then((m) => m.headingSchema),
  component: () => import("./Component.js").then((m) => m.HeadingComponent),
});
