import type { TemplateData } from "plumix";
import type { ResolvedThemeTokens } from "plumix/blocks";
import type { AppContext } from "plumix/plugin";
import { isEntry, labelSourceText } from "plumix";

import type { CardArgs, CardRule } from "./card.js";
import type { CardNode } from "./renderer.js";
import { cardKey } from "./card-key.js";
import { cardIdentityFor, cardTargetPath } from "./card-target.js";
import { card } from "./card.js";
import { CARD_HEIGHT, CARD_WIDTH } from "./renderer.js";

/**
 * Which of the theme's `color` tokens the bundled card paints from — a token
 * slug per role it fills. Documented on `OgPluginOptions.palette`, which is
 * where a site sets it.
 */
export interface CardPalette {
  readonly background?: string;
  readonly foreground?: string;
  readonly mutedForeground?: string;
}

// Not an identity map: `defineTheme` holds token slugs to `[a-z][a-z0-9-]*`,
// so the kebab-case slug a theme has to declare and the camelCase key this
// option is read with cannot be the same string.
const CONVENTION = {
  background: "background",
  foreground: "foreground",
  mutedForeground: "muted-foreground",
} satisfies Required<CardPalette>;

// Ordinary CSS against ordinary class names, custom properties included — the
// same shape a theme-declared card is written in, and the reason the engine has
// to resolve `var()` rather than take flattened values. Each bundled colour is
// a `var()` fallback rather than a `:root` block of the card's own: such a
// block ships after the theme's and beats it, which is what kept a theme's
// palette out of this card entirely.
const STYLESHEET = `
.plumix-og-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: ${CARD_WIDTH}px;
  height: ${CARD_HEIGHT}px;
  padding: 72px;
  background-color: var(--plumix-og-background, #0b1220);
}
.plumix-og-card__title {
  color: var(--plumix-og-foreground, #f8fafc);
  font-size: 76px;
  font-weight: 700;
  line-height: 1.15;
}
.plumix-og-card__site {
  color: var(--plumix-og-muted-foreground, #94a3b8);
  font-size: 32px;
}
`;

/**
 * The theme's palette mapped onto the properties {@link STYLESHEET} falls back
 * to, or `""` for a theme whose palette the card leaves alone.
 *
 * All-or-nothing because a half-taken palette is worse than an untaken one: the
 * theme's paper under the bundled card's near-white ink is unreadable, while a
 * card that took nothing merely looks unlike the site.
 *
 * A slug is a lookup key here and never reaches the CSS. Only values do, and
 * those came through `sanitizeCssValue` on their way out of
 * `resolveThemeTokens`.
 */
export function defaultCardPaletteCss(
  tokens: ResolvedThemeTokens,
  palette: CardPalette = {},
): string {
  const colors = tokens.color ?? {};
  // Own properties only. A palette naming `constructor` or `toString` would
  // otherwise resolve to something off the prototype and stringify it into the
  // sheet, braces and all.
  const declared = (slug: string): string | undefined =>
    Object.hasOwn(colors, slug) ? colors[slug] : undefined;
  const background = declared(palette.background ?? CONVENTION.background);
  const foreground = declared(palette.foreground ?? CONVENTION.foreground);
  const muted = declared(palette.mutedForeground ?? CONVENTION.mutedForeground);
  if (
    background === undefined ||
    foreground === undefined ||
    muted === undefined
  ) {
    return "";
  }
  return `:root { --plumix-og-background: ${background}; --plumix-og-foreground: ${foreground}; --plumix-og-muted-foreground: ${muted}; }`;
}

/**
 * What a fresh install renders, with no theme configuration: the page's own
 * title over the site's name on a plain ground — for every page kind a card is
 * served for, not just an entry, so "install the plugin and cards work" holds
 * on a tag archive as much as on a post.
 *
 * Declared as an ordinary `fallback` rule, so a theme's own `ogCards` outrank
 * it by sitting ahead of it.
 */
export const defaultCards: readonly CardRule[] = [
  card.fallback().define({
    settings: ["site"],
    styles: [STYLESHEET],
    // The card renders two lines, so the key names both — an entry's
    // second-resolution `updatedAt` alone would let a same-second retitle keep
    // the old card, and two archives of one site would otherwise collide on the
    // site name alone.
    key: (args) => {
      const [headline, footer] = lines(args);
      return isEntry(args.data)
        ? cardKey.entry(args.data.entry, headline, footer)
        : cardKey.of(pageName(args.data), headline, footer);
    },
    render: (args) => cardNode(...lines(args)),
  }),
];

/** The two lines the card carries: the page's own title, then the site's name. */
function lines(args: CardArgs<TemplateData>): readonly [string, string] {
  const site = siteSetting(args, "title");
  // On the front page the headline *is* the site, so the line below it carries
  // the tagline instead of saying the same thing twice.
  return args.data.kind === "frontPage"
    ? [site, siteSetting(args, "tagline")]
    : [pageTitle(args.data, args.ctx), site];
}

/**
 * What the page calls itself, read from the page's own data rather than from
 * whoever resolved it: the head and the route both reach this, and a title
 * either could not reproduce would put them on different digests and redirect
 * every scraper away from its image.
 */
function pageTitle(data: TemplateData, ctx: AppContext): string {
  switch (data.kind) {
    case "entry":
      return data.entry.title;
    case "taxonomy":
      return data.term.name;
    case "author":
      return data.author.name ?? data.author.slug;
    case "archive": {
      const type = ctx.plugins.entryTypes.get(data.contentType);
      return type
        ? labelSourceText(type.labels?.plural ?? type.label)
        : data.contentType;
    }
    case "date":
      return dateTitle(data.year, data.month, data.day);
    default:
      return "";
  }
}

// Core's own date-archive title, spelled the way `page-data.ts` spells it: the
// card's headline is the page's own title, so the two have to stay in step. Not
// `dateSegment`, which pads the year for a URL that has to round-trip.
function dateTitle(
  year: number,
  month: number | null,
  day: number | null,
): string {
  const parts = [String(year)];
  if (month !== null) parts.push(String(month).padStart(2, "0"));
  if (day !== null) parts.push(String(day).padStart(2, "0"));
  return parts.join("-");
}

// Which page this is, for the key. Two archives on one site render the same two
// lines only by coincidence, but a card keyed on what it renders alone would
// hand them one URL the first time they did.
function pageName(data: TemplateData): string {
  const identity = cardIdentityFor(data);
  return identity === null ? data.kind : cardTargetPath(identity.target);
}

function cardNode(title: string, footer: string): CardNode {
  const children: CardNode[] = [
    { type: "text", className: "plumix-og-card__title", text: title },
  ];
  if (footer.length > 0) {
    children.push({
      type: "text",
      className: "plumix-og-card__site",
      text: footer,
    });
  }
  return { type: "container", className: "plumix-og-card", children };
}

/** Empty on a site that has not set one, which leaves that line off. */
function siteSetting(
  args: CardArgs<TemplateData>,
  key: "title" | "tagline",
): string {
  const value = args.settings?.site?.[key];
  return typeof value === "string" ? value : "";
}
