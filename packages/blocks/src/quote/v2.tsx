import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const quoteBlockV2 = defineBlock({
  name: "core/quote",
  title: "Quote",
  icon: "Quote",
  category: "text",
  inputs: [
    { name: "text", type: "text", label: "Quote" },
    { name: "citation", type: "text", label: "Citation" },
  ],
  defaults: { text: "", citation: "" },
  render: ({ attrs }): ReactNode => {
    const { text = "", citation = "" } = attrs as {
      readonly text?: string;
      readonly citation?: string;
    };
    return (
      <blockquote cite={citation.length > 0 ? citation : undefined}>
        {text}
      </blockquote>
    );
  },
});
