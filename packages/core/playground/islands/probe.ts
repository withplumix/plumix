"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/**
 * The island most fixtures share; specs wait on its `data-live`.
 * `createElement`, not JSX, keeps it transform-agnostic across jiti and the
 * vite worker bundle.
 */
export function Probe({
  testId,
  label,
  children,
}: IslandProps<{
  readonly testId: string;
  readonly label: string;
  readonly children?: ReactNode;
}>): ReactNode {
  const live = useIsLive();
  return h(
    "div",
    { "data-testid": testId, "data-live": live ? "" : undefined },
    h("span", { "data-testid": `${testId}-label` }, label),
    children,
  );
}
