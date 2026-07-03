import type { ReactNode } from "react";

import type { BlockNode } from "../render-block-tree.js";
import { defineBlock } from "../block-registry.js";

// Two equal columns, each seeded with a paragraph so a fresh row isn't bare.
const DEFAULT_COLUMNS: readonly BlockNode[] = [
  {
    id: "column-1",
    name: "core/column",
    attrs: { content: [{ id: "column-1-text", name: "core/rich-text" }] },
  },
  {
    id: "column-2",
    name: "core/column",
    attrs: { content: [{ id: "column-2-text", name: "core/rich-text" }] },
  },
];

export const columnsBlock = defineBlock({
  name: "core/columns",
  title: "Columns",
  icon: "Columns",
  category: "layout",
  // selfSeam so `display:flex` + `gap` land on the row itself, making the
  // columns its direct flex items.
  selfSeam: true,
  inputs: [
    {
      name: "columns",
      type: "slot",
      label: "Columns",
      allowedBlocks: ["core/column"],
      defaultChildren: DEFAULT_COLUMNS,
    },
  ],
  // A flex row with a gap that stacks below tablet (Builder's stackColumnsAt
  // default). All editable per device in the Styles tab's Layout section.
  defaultStyles: {
    large: { display: "flex", gap: "20px", alignItems: "stretch" },
    medium: { flexDirection: "column" },
  },
  render: ({ attrs, blockProps }): ReactNode => {
    const Columns = attrs.columns as (() => ReactNode) | undefined;
    return <div {...blockProps}>{Columns ? <Columns /> : null}</div>;
  },
});
