import type { BlockViewProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h } from "react";

const SYMBOLS = { star: "★", heart: "♥" } as const;

export default function RatingView({ attrs }: BlockViewProps): ReactNode {
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
}
