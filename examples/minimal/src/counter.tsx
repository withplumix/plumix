"use client";

import { createElement, useState } from "react";

interface CounterProps {
  readonly label: string;
}

export function Counter(props: CounterProps) {
  const [count, setCount] = useState(0);
  return createElement(
    "button",
    {
      "data-testid": `counter-${props.label}`,
      onClick: () => {
        setCount((n) => n + 1);
      },
      style: { padding: "0.5rem 1rem" },
    },
    `${props.label}: ${String(count)}`,
  );
}
