import type { ResolvedThemeTokens } from "plumix/blocks";
import type { AppContext } from "plumix/plugin";
import type { TemplateData } from "plumix/theme";
import { labelSourceText } from "plumix/i18n";
import { isEntry } from "plumix/theme";

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

// Not an identity map: token slugs are kebab-case, option keys camelCase.
const CONVENTION = {
  background: "background",
  foreground: "foreground",
  mutedForeground: "muted-foreground",
} satisfies Required<CardPalette>;

// Bundled colours are `var()` fallbacks, not a `:root` block, which would ship
// after the theme's and beat its palette.
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
 * All-or-nothing: a half-taken palette can be unreadable. Only values reach the
 * CSS, already sanitized by `resolveThemeTokens`.
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

/** An ordinary `fallback` rule, so a theme's own `ogCards` outrank it. */
export const defaultCards: readonly CardRule[] = [
  card.fallback().define({
    settings: ["site"],
    styles: [STYLESHEET],
    // `updatedAt` has second resolution, so a same-second retitle would keep
    // the old card.
    key: (args) => {
      const [headline, footer] = lines(args);
      return isEntry(args.data)
        ? cardKey.entry(args.data.entry, headline, footer)
        : cardKey.of(pageName(args.data), headline, footer);
    },
    render: (args) => cardNode(...lines(args)),
  }),
];

function lines(args: CardArgs<TemplateData>): readonly [string, string] {
  const site = siteSetting(args, "title");
  // On the front page the headline *is* the site, so the line below it carries
  // the tagline instead of saying the same thing twice.
  return args.data.kind === "frontPage"
    ? [site, siteSetting(args, "tagline")]
    : [pageTitle(args.data, args.ctx), site];
}

// From the page's own data, so head and route compute the same digest.
function pageTitle(data: TemplateData, ctx: AppContext): string {
  switch (data.kind) {
    case "entry":
      return data.entry.title;
    case "term":
      return data.term.name;
    case "author":
      return data.author.name ?? data.author.slug;
    case "entryType": {
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

// Must match core's date-archive title; not `dateSegment`, which pads the year.
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

// Two archives can render the same lines; without this they'd share a URL.
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

function siteSetting(
  args: CardArgs<TemplateData>,
  key: "title" | "tagline",
): string {
  const value = args.settings?.site?.[key];
  return typeof value === "string" ? value : "";
}
