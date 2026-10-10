import type { ResolvedThemeTokens, ThemeTokens } from "plumix/blocks";
import { emitThemeTokenCss, resolveThemeTokens } from "plumix/blocks";

import type { CardPalette } from "./default-card.js";
import { defaultCardPaletteCss } from "./default-card.js";

/** The theme's design vocabulary, in the two forms a card reads it in. */
export interface ThemeTokenSet {
  /**
   * Spread ahead of a card's own sheet. All are digested, so retuning the
   * default palette also re-keys a theme's own cards once.
   */
  readonly stylesheets: readonly string[];
  /** The same tokens as values, for what a card decides in JavaScript. */
  readonly values: ResolvedThemeTokens;
}

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
