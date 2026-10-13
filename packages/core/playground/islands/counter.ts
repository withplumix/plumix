"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/** Counts clicks and echoes the last key pressed in its input. */
export function Counter({
  children,
}: IslandProps<{ readonly children?: ReactNode }>): ReactNode {
  const live = useIsLive();
  const [count, setCount] = useState(0);
  const [key, setKey] = useState("");
  return h(
    "div",
    { "data-testid": "counter", "data-live": live ? "" : undefined },
    h(
      "button",
      {
        "data-testid": "counter-button",
        type: "button",
        onClick: () => {
          setCount((n) => n + 1);
        },
      },
      String(count),
    ),
    h("input", {
      "data-testid": "counter-input",
      onKeyDown: (event: { readonly key: string }) => {
        setKey(event.key);
      },
    }),
    h("output", { "data-testid": "counter-key" }, key),
    children,
  );
}

/** A button that counts its clicks. */
export function Clicker({
  testId,
}: IslandProps<{ readonly testId: string }>): ReactNode {
  const live = useIsLive();
  const [count, setCount] = useState(0);
  return h(
    "button",
    {
      "data-testid": testId,
      "data-live": live ? "" : undefined,
      type: "button",
      onClick: () => {
        setCount((n) => n + 1);
      },
    },
    String(count),
  );
}
