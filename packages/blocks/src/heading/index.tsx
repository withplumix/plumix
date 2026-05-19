import type { JSX, ReactNode } from "react";
import { createElement } from "react";

import { defineBlock } from "../block-registry.js";

export const headingBlock = defineBlock({
  name: "core/heading",
  title: "Heading",
  icon: "Heading",
  category: "text",
  defaults: { level: 2, text: "" },
  render: ({ attrs }): ReactNode => {
    const { level = 2, text = "" } = attrs as {
      readonly level?: number;
      readonly text?: string;
    };
    const tag = `h${level}` as keyof JSX.IntrinsicElements;
    return createElement(tag, null, text);
  },
});
