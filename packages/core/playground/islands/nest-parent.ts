"use client";

import type { IslandProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h, isValidElement } from "react";
import { useIsLive } from "plumix/blocks/renderer";

/**
 * Renders a nested island's slot before its own, so the nested island's slot
 * comes first in the document. Once live it shows the HTML its own slot was
 * hydrated with.
 */
export function NestParent({
  nested,
  children,
}: IslandProps<{
  readonly nested?: ReactNode;
  readonly children?: ReactNode;
}>): ReactNode {
  const live = useIsLive();
  return h(
    "section",
    {
      "data-testid": "nest-parent",
      "data-live": live ? "" : undefined,
      "data-slot-html": live ? slotHtml(children) : undefined,
    },
    nested,
    children,
  );
}

/** On the client a slot arrives as a `StaticHtml` element carrying `html`. */
function slotHtml(slot: ReactNode): string {
  if (!isValidElement<{ html?: unknown }>(slot)) return "";
  return typeof slot.props.html === "string" ? slot.props.html : "";
}
