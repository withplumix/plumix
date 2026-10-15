import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineBlock } from "plumix/blocks";

const SYMBOLS = { star: "★", heart: "♥" } as const;

/** A number and a radio input, which no core block declares. */
export const ratingBlock = defineBlock({
  name: "playground/rating",
  title: "Rating",
  icon: "Star",
  category: "text",
  inputs: [
    { name: "score", type: "number", label: "Score out of five" },
    {
      name: "symbol",
      type: "radio",
      label: "Symbol",
      options: [
        { label: "Stars", value: "star" },
        { label: "Hearts", value: "heart" },
      ],
    },
  ],
  defaults: { score: 3, symbol: "star" },
  render: ({ attrs }): ReactNode => {
    const { score, symbol } = attrs as {
      readonly score?: number | null;
      readonly symbol?: keyof typeof SYMBOLS;
    };
    return h("p", null, SYMBOLS[symbol ?? "star"].repeat(score ?? 0));
  },
});
