import type { JSX, ReactNode } from "react";
import { createElement } from "react";

import { defineBlock } from "../block-registry.js";

export const headingBlock = defineBlock({
  name: "core/heading",
  title: "Heading",
  icon: "Heading",
  category: "text",
  defaults: { level: 2, text: "" },
  transforms: {
    priority: 50,
    to: [{ target: "core/paragraph", mapAttrs: (a) => ({ text: a.text }) }],
  },
  render: ({ attrs }): ReactNode => {
    const { level: rawLevel, text = "" } = attrs as {
      readonly level?: unknown;
      readonly text?: string;
    };
    const level =
      typeof rawLevel === "number" &&
      Number.isInteger(rawLevel) &&
      rawLevel >= 1 &&
      rawLevel <= 6
        ? rawLevel
        : 2;
    const tag = `h${level}` as keyof JSX.IntrinsicElements;
    return createElement(tag, null, text);
  },
});
