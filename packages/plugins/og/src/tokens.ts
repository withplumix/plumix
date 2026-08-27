import type { ResolvedThemeTokens, ThemeTokens } from "plumix/blocks";
import { emitThemeTokenCss, resolveThemeTokens } from "plumix/blocks";

import type { CardPalette } from "./default-card.js";
import { defaultCardPaletteCss } from "./default-card.js";

/** The theme's design vocabulary, in the two forms a card reads it in. */
export interface ThemeTokenSet {
  /**
   * The `:root` blocks to spread ahead of a card's own sheet: the theme's own
   * custom properties, then the bundled card's palette compiled from them. An
   * array so a theme that declared neither contributes nothing at either place
   * it is spread, rather than empty rules both would have to test for.
   *
   * They travel together because both are folded into a card's digest, and a
   * card is only correctly addressed when everything that paints it is. The
   * cost is that retuning the bundled card's palette re-keys a theme's own
   * cards too, which read none of it — once, on the deploy that changes it.
   */
  readonly stylesheets: readonly string[];
  /** The same tokens as values, for what a card decides in JavaScript. */
  readonly values: ResolvedThemeTokens;
}

/**
 * A theme's tokens compiled once, at the boot-time handover — nothing about a
 * token is request-scoped, and every card render reads the same set. Both forms
 * come off one filter, so what a card can style with is what it can read.
 */
export function compileThemeTokens(
  tokens: ThemeTokens = {},
  palette?: CardPalette,
): ThemeTokenSet {
  const values = resolveThemeTokens(tokens);
  return {
    stylesheets: [
      emitThemeTokenCss(tokens),
      defaultCardPaletteCss(values, palette),
    ].filter((sheet) => sheet !== ""),
    values,
  };
}
