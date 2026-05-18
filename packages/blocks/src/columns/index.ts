import { defineBlock } from "../define-block.js";

// Canonical ratios the Inspector exposes. Authors typing a raw ratio
// at the persistence layer still work because the Component validates
// against the same `n[:m]*` regex; this list controls the dropdown
// only, not the parser.
const RATIO_OPTIONS = [
  { value: "1:1", label: "Two equal columns (1:1)" },
  { value: "1:2", label: "Narrow + wide (1:2)" },
  { value: "2:1", label: "Wide + narrow (2:1)" },
  { value: "1:1:1", label: "Three equal columns (1:1:1)" },
  { value: "1:2:1", label: "Three columns 1:2:1" },
  { value: "2:1:2", label: "Three columns 2:1:2" },
  { value: "1:1:1:1", label: "Four equal columns" },
] as const;

function emptyColumns(count: number): readonly { name: "core/column" }[] {
  return Array.from({ length: count }, () => ({ name: "core/column" }));
}

export const columnsBlock = defineBlock({
  name: "core/columns",
  title: "Columns",
  icon: "Columns2",
  category: "layout",
  description: "Multi-column container with explicit ratios.",
  attributes: {
    ratio: {
      type: "select",
      label: "Ratio",
      default: "1:1",
      options: RATIO_OPTIONS,
    },
  },
  defaultInnerBlocks: emptyColumns(2),
  variations: [
    {
      name: "50-50",
      title: "Two columns 50/50",
      description: "Equal-width pair.",
      keywords: ["two", "equal", "halves"],
      attributes: { ratio: "1:1" },
      innerBlocks: emptyColumns(2),
    },
    {
      name: "33-67",
      title: "Two columns 33/67",
      description: "Narrow + wide.",
      keywords: ["two", "asymmetric"],
      attributes: { ratio: "1:2" },
      innerBlocks: emptyColumns(2),
    },
    {
      name: "67-33",
      title: "Two columns 67/33",
      description: "Wide + narrow.",
      keywords: ["two", "asymmetric"],
      attributes: { ratio: "2:1" },
      innerBlocks: emptyColumns(2),
    },
    {
      name: "25-50-25",
      title: "Three columns 25/50/25",
      description: "Centred wide column flanked by two narrow.",
      keywords: ["three", "centred"],
      attributes: { ratio: "1:2:1" },
      innerBlocks: emptyColumns(3),
    },
    {
      name: "25-25-25-25",
      title: "Four equal columns",
      description: "Four equal-width siblings.",
      keywords: ["four", "equal", "quarters"],
      attributes: { ratio: "1:1:1:1" },
      innerBlocks: emptyColumns(4),
    },
  ],
  supports: {
    color: { background: true },
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.columnsSchema),
  component: () => import("./Component.js").then((m) => m.ColumnsComponent),
});
