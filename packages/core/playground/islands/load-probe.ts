"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/**
 * A module of its own, so a spec can fail its chunk alone, and the chunk
 * `islands-raw`'s hand-written island points at.
 */
export function LoadProbe({
  label,
  children,
}: IslandProps<{
  readonly label: string;
  readonly children?: ReactNode;
}>): ReactNode {
  const live = useIsLive();
  return h(
    "div",
    { "data-testid": "load-probe", "data-live": live ? "" : undefined },
    h("span", { "data-testid": "load-probe-label" }, label),
    children,
  );
}
