/**
 * `value` is the `var(..., <fallback>)` literal; omit it when `:root` provides
 * it. `label` defaults to the slug.
 */
export interface ThemeTokenEntry {
  readonly value?: string;
  readonly label?: string;
}

export type ThemeTokenGroup = Readonly<Record<string, ThemeTokenEntry>>;

/**
 * Keys are camelCase CSS property names, except `color` and `spacing`, which
 * span many properties.
 */
export type KnownTokenCategory =
  | "color"
  | "spacing"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "borderWidth"
  | "borderRadius"
  | "boxShadow"
  | "textShadow"
  | "backgroundImage"
  | "maxWidth";

/**
 * The `& {}` keeps autocomplete for the known set while accepting any camelCase
 * CSS property.
 */
export type TokenCategory = KnownTokenCategory | (string & {});

/**
 * Open to any CSS property. An undeclared category falls through to custom
 * values for that axis.
 */
export type ThemeTokens = Partial<Record<KnownTokenCategory, ThemeTokenGroup>> &
  Readonly<Record<string, ThemeTokenGroup | undefined>>;

/** One category's tokens, slug to the CSS value the theme declared. */
export type ResolvedTokenGroup = Readonly<Record<string, string>>;

/**
 * A theme's tokens reduced to the values that can actually be written into a
 * declaration — what `resolveThemeTokens` returns, and the set a card both
 * styles with and reads.
 */
export type ResolvedThemeTokens = Partial<
  Record<KnownTokenCategory, ResolvedTokenGroup>
> &
  Readonly<Record<string, ResolvedTokenGroup | undefined>>;
