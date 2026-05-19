import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const descriptionListBlockV2 = defineBlock({
  name: "core/description-list",
  title: "Description List",
  icon: "List",
  category: "text",
  inputs: [{ name: "items", type: "slot", label: "Items" }],
  defaults: {},
  render: ({ attrs }): ReactNode => {
    const Items = attrs.items as (() => ReactNode) | undefined;
    return <dl>{Items ? <Items /> : null}</dl>;
  },
});

export const descriptionTermBlockV2 = defineBlock({
  name: "core/description-term",
  title: "Term",
  icon: "Type",
  category: "text",
  inline: true,
  inputs: [{ name: "text", type: "text", label: "Term" }],
  defaults: { text: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    return <dt>{text}</dt>;
  },
});

export const descriptionDetailBlockV2 = defineBlock({
  name: "core/description-detail",
  title: "Detail",
  icon: "AlignLeft",
  category: "text",
  inline: true,
  inputs: [{ name: "text", type: "textarea", label: "Detail" }],
  defaults: { text: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    return <dd>{text}</dd>;
  },
});
