// Bridges SSR'd HTML across the islands hydration boundary. Without an
// RSC payload there's no way to pass live JSX as a prop into a client
// island — this is the documented React 19 substitute, lifted from
// Astro's `StaticHtml` (`packages/integrations/react/src/static-html.ts`,
// Apache-2.0). The `memo(() => true)` comparator guarantees a parent
// re-render never re-renders the static subtree.

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
