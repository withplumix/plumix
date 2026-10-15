"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useEffect, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/** Its text differs between the server and the client render. */
export function Mismatch(): ReactNode {
  return h(
    "span",
    { "data-testid": "mismatch" },
    typeof window === "undefined" ? "SERVER" : "CLIENT",
  );
}

/** Diverges like `Mismatch`, behind React's `suppressHydrationWarning`. */
export function Suppressed(): ReactNode {
  const live = useIsLive();
  return h(
    "span",
    {
      "data-testid": "suppressed",
      "data-live": live ? "" : undefined,
      suppressHydrationWarning: true,
    },
    typeof window === "undefined" ? "SERVER" : "CLIENT",
  );
}

/** Renders a button whose click makes the next render throw. */
export function ThrowOnClick(): ReactNode {
  const [thrown, setThrown] = useState(false);
  if (thrown) throw new Error("thrown on click");
  return h(
    "button",
    {
      "data-testid": "throw-on-click",
      type: "button",
      onClick: () => {
        setThrown(true);
      },
    },
    "Throw",
  );
}

/**
 * Throws once hydrated, from an effect, so its server render still succeeds.
 */
export function Failing({
  testId,
  message,
}: IslandProps<{
  readonly testId: string;
  readonly message: string;
}>): ReactNode {
  useEffect(() => {
    throw new Error(message);
  }, [message]);
  return h("span", { "data-testid": testId }, message);
}
