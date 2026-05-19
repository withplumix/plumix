import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const paragraphBlockV2 = defineBlock({
  name: "core/paragraph",
  title: "Paragraph",
  icon: "Paragraph",
  category: "text",
  inputs: [{ name: "text", type: "text", label: "Text" }],
  defaults: { text: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    return <p>{text}</p>;
  },
});
