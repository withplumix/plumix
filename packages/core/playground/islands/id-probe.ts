"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, useId } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/**
 * Labels an input through `useId`, the way Radix and shadcn scope theirs. Once
 * live it prints the client's id, since React leaves a mismatched attribute as
 * the server rendered it.
 */
export function IdProbe({
  testId,
}: IslandProps<{ readonly testId: string }>): ReactNode {
  const live = useIsLive();
  const id = useId();
  return h(
    "div",
    { "data-testid": testId, "data-live": live ? "" : undefined },
    h("label", { htmlFor: id }, testId),
    h("input", { id }),
    h("output", null, live ? id : ""),
  );
}
