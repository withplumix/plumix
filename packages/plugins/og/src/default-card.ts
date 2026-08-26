import type { TemplateData } from "plumix";
import { isEntry } from "plumix";

import type { CardArgs, CardRule } from "./card.js";
import type { CardNode } from "./renderer.js";
import { cardKey } from "./card-key.js";
import { card } from "./card.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";

// Ordinary CSS against ordinary class names, custom properties included —
// the same shape a theme-declared card is written in, and the reason the
// engine has to resolve `var()` rather than take flattened values.
const STYLESHEET = `
:root {
  --plumix-og-ground: #0b1220;
  --plumix-og-ink: #f8fafc;
  --plumix-og-muted: #94a3b8;
  --plumix-og-gutter: 72px;
}
.plumix-og-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  padding: var(--plumix-og-gutter);
  background-color: var(--plumix-og-ground);
}
.plumix-og-card__title {
  color: var(--plumix-og-ink);
  font-size: 76px;
  font-weight: 700;
  line-height: 1.15;
}
.plumix-og-card__site {
  color: var(--plumix-og-muted);
  font-size: 32px;
}
`;

/**
 * What a fresh install renders, with no theme configuration: the page's title
 * over the site's name on a plain ground. Declared as an ordinary `fallback`
 * rule, so a theme's own `ogCards` outrank it by sitting ahead of it.
 */
export const defaultCards: readonly CardRule[] = [
  card.fallback().define({
    settings: ["site"],
    styles: [STYLESHEET],
    // The card renders a title and a site name, so the key names both — an
    // entry's second-resolution `updatedAt` alone would let a same-second
    // retitle keep the old card.
    key: ({ data, settings }) => {
      const site = siteName(settings);
      return isEntry(data)
        ? cardKey.entry(data.entry, data.entry.title, site)
        : cardKey.of(data.kind, site);
    },
    render: ({ data, settings }) =>
      cardNode(isEntry(data) ? data.entry.title : "", siteName(settings)),
  }),
];

function cardNode(title: string, site: string): CardNode {
  const children: CardNode[] = [
    { type: "text", className: "plumix-og-card__title", text: title },
  ];
  if (site.length > 0) {
    children.push({
      type: "text",
      className: "plumix-og-card__site",
      text: site,
    });
  }
  return { type: "container", className: "plumix-og-card", children };
}

/** Empty on a site that has not set one, which leaves the footer line off. */
function siteName(settings: CardArgs<TemplateData>["settings"]): string {
  const title = settings?.site?.title;
  return typeof title === "string" ? title : "";
}
