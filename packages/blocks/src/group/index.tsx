import type { CSSProperties, ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

const LAYOUTS = ["flow", "flex-row", "flex-column", "grid"] as const;
type GroupLayout = (typeof LAYOUTS)[number];

function pickLayout(raw: unknown): GroupLayout {
  return typeof raw === "string" && (LAYOUTS as readonly string[]).includes(raw)
    ? (raw as GroupLayout)
    : "flow";
}

// Structural layout only — `display`/`flex-direction` define the layout and
// come from the `layout` attr. Gap, columns, etc. stay editable in the Styles
// tab (they're not baked here so an author override actually wins).
function layoutStyle(layout: GroupLayout): CSSProperties | undefined {
  switch (layout) {
    case "flex-row":
      return { display: "flex", flexDirection: "row" };
    case "flex-column":
      return { display: "flex", flexDirection: "column" };
    case "grid":
      return { display: "grid" };
    case "flow":
      return undefined;
  }
}

export const groupBlock = defineBlock({
  name: "core/group",
  title: "Box",
  icon: "Box",
  category: "layout",
  // selfSeam so the block class (author styles + the default gap) and the
  // layout `display` sit on the same element — otherwise gap would land on a
  // wrapper div and never reach the flex/grid container.
  selfSeam: true,
  inputs: [
    {
      name: "layout",
      type: "select",
      label: "Layout",
      options: LAYOUTS.map((v) => ({ label: v, value: v })),
    },
    { name: "content", type: "slot", label: "Content" },
  ],
  defaults: { layout: "flow" },
  // An editable default gap — inert for `flow`, spaces children for
  // flex/grid. Seeded into the Styles tab, not baked.
  defaultStyles: { large: { gap: "1rem" } },
  render: ({ attrs, blockProps }): ReactNode => {
    const layout = pickLayout(attrs.layout);
    const Content = attrs.content as (() => ReactNode) | undefined;
    return (
      <div data-layout={layout} {...blockProps} style={layoutStyle(layout)}>
        {Content ? <Content /> : null}
      </div>
    );
  },
});
