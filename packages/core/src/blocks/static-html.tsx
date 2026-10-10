// Without an RSC payload, live JSX can't be passed into a client island; this
// is the React 19 substitute, from Astro's `StaticHtml` (see LICENSE).

import { createElement, memo } from "react";

interface StaticHtmlProps {
  readonly html: string;
  readonly slotName?: string;
}

export const StaticHtml = memo(
  function StaticHtml({ html, slotName = "children" }: StaticHtmlProps) {
    return createElement("plumix-static-slot", {
      "data-plumix-slot": slotName,
      dangerouslySetInnerHTML: { __html: html },
      suppressHydrationWarning: true,
    });
  },
  () => true,
);
