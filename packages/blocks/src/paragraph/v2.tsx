import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const paragraphBlockV2 = defineBlock({
  name: "core/paragraph",
  title: "Paragraph",
  icon: "Paragraph",
  category: "text",
  inputs: [{ name: "text", type: "text", label: "Text" }],
  defaults: { text: "" },
  transforms: {
    priority: 50,
    to: [
      {
        target: "core/heading",
        mapAttrs: (a) => ({ level: 2, text: a.text }),
      },
      {
        target: "core/quote",
        mapAttrs: (a) => ({ text: a.text, citation: "" }),
      },
    ],
  },
  render: ({ attrs }): ReactNode => {
    const { text = "" } = attrs as { readonly text?: string };
    return <p>{text}</p>;
  },
});
