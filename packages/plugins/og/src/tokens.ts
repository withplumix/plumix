import type { ResolvedThemeTokens, ThemeTokens } from "plumix/blocks";
import { emitThemeTokenCss, resolveThemeTokens } from "plumix/blocks";

/** The theme's design vocabulary, in the two forms a card reads it in. */
export interface ThemeTokenSet {
  /**
   * The `:root` custom properties, ready to spread ahead of a card's own sheet.
   * An array so a theme that declared none contributes nothing at either place
   * it is spread, rather than an empty rule both would have to test for.
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
export function compileThemeTokens(tokens: ThemeTokens = {}): ThemeTokenSet {
  const stylesheet = emitThemeTokenCss(tokens);
  return {
    stylesheets: stylesheet === "" ? [] : [stylesheet],
    values: resolveThemeTokens(tokens),
  };
}
