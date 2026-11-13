import type { BlockViewProps } from "plumix/blocks";
import type { ReactNode } from "react";

const SYMBOLS = { star: "★", heart: "♥" } as const;

export default function RatingView({ attrs }: BlockViewProps): ReactNode {
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
}
