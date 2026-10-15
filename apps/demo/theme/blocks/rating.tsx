import type { ReactNode } from "react";
import { defineBlock } from "plumix/blocks";

const SYMBOLS = { star: "★", heart: "♥" } as const;

export const ratingBlock = defineBlock({
  name: "demo/rating",
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
    const {
      score = 0,
      symbol = "star",
      label = "",
    } = attrs as {
      readonly score?: number | null;
      readonly symbol?: keyof typeof SYMBOLS;
      readonly label?: string;
    };
    const filled = Math.max(0, Math.min(5, Math.round(score ?? 0)));
    return (
      <p>
        <span aria-hidden>{SYMBOLS[symbol].repeat(filled)}</span>{" "}
        {label || `${String(filled)} out of 5`}
      </p>
    );
  },
});
