"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/**
 * A module of its own, so a spec can watch for its chunk's request.
 */
export function PrefetchProbe(_props: IslandProps<object>): ReactNode {
  const live = useIsLive();
  const [count, setCount] = useState(0);
  return h(
    "button",
    {
      "data-testid": "prefetch-probe",
      "data-live": live ? "" : undefined,
      type: "button",
      onClick: () => {
        setCount((n) => n + 1);
      },
    },
    String(count),
  );
}
