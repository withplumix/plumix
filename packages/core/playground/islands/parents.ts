"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useState } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/** Drops its slot, and the island inside it, on click. */
export function DropParent({
  children,
}: IslandProps<{ readonly children?: ReactNode }>): ReactNode {
  const live = useIsLive();
  const [dropped, setDropped] = useState(false);
  return h(
    "section",
    { "data-testid": "drop-parent", "data-live": live ? "" : undefined },
    h(
      "button",
      {
        "data-testid": "drop-parent-button",
        type: "button",
        onClick: () => {
          setDropped(true);
        },
      },
      "Drop",
    ),
    dropped ? null : children,
  );
}

/** Its own text differs between the server and the client render. */
export function DivergeParent({
  children,
}: IslandProps<{ readonly children?: ReactNode }>): ReactNode {
  const live = useIsLive();
  return h(
    "section",
    { "data-testid": "diverge-parent", "data-live": live ? "" : undefined },
    h("span", null, typeof window === "undefined" ? "server" : "client"),
    children,
  );
}
