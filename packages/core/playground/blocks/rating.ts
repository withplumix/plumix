import type { ReactNode } from "react";
import { createElement as h } from "react";
import { defineBlock } from "plumix/blocks";

const SYMBOLS = { star: "★", heart: "♥" } as const;

/**
 * A number and a radio input, which no core block declares, and a label that
 * tells one rating from another.
 */
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
    { name: "label", type: "text", label: "Label" },
  ],
  defaults: { score: 3, symbol: "star", label: "" },
  render: ({ attrs }): ReactNode => {
    const { score, symbol, label } = attrs as {
      readonly score?: number | null;
      readonly symbol?: keyof typeof SYMBOLS;
      readonly label?: string;
    };
    return h(
      "p",
      null,
      SYMBOLS[symbol ?? "star"].repeat(score ?? 0),
      label ? ` ${label}` : null,
    );
  },
});
