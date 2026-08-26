import type { CardNode } from "./renderer.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";

export interface DefaultCardArgs {
  readonly title: string;
  /** Omitted on a site that has not set one, which leaves the footer line off. */
  readonly siteName?: string;
}

export interface Card {
  readonly node: CardNode;
  readonly stylesheets: readonly string[];
}

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
 * over the site's name on a plain ground.
 */
export function defaultCard(args: DefaultCardArgs): Card {
  const children: CardNode[] = [
    {
      type: "text",
      className: "plumix-og-card__title",
      text: args.title,
    },
  ];
  if (args.siteName !== undefined) {
    children.push({
      type: "text",
      className: "plumix-og-card__site",
      text: args.siteName,
    });
  }
  return {
    node: { type: "container", className: "plumix-og-card", children },
    stylesheets: [STYLESHEET],
  };
}
