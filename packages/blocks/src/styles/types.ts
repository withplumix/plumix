/**
 * One entry in a token group. `value` is the CSS literal written as
 * the `var(..., <fallback>)`; omit when `:root` provides it. `label`
 * is the Inspector display name; defaults to the slug.
 */
export interface ThemeTokenEntry {
  readonly value?: string;
  readonly label?: string;
}

export type ThemeTokenGroup = Readonly<Record<string, ThemeTokenEntry>>;

/**
 * The token categories the editor offers controls for by default. Keys are CSS
 * property names (camelCase), except `color` and `spacing` — the two buckets
 * that span many properties (any color field / any margin-padding-gap field).
 * A theme may register tokens under any other CSS property too (see
 * {@link ThemeTokens}); these are just the well-known ones.
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
 * A token category: a well-known key (with autocomplete) or any CSS property
 * (camelCase) a theme chooses to tokenize. The `& {}` keeps literal-completion
 * for the known set while still accepting an arbitrary string.
 */
export type TokenCategory = KnownTokenCategory | (string & {});

/**
 * The theme's design vocabulary — a slug-keyed token group per category. Open:
 * a theme can register tokens for any CSS property, not just the well-known set
 * (Builder-style). All groups are optional; an undeclared category falls
 * through to inline/custom values for that axis.
 */
export type ThemeTokens = Partial<Record<KnownTokenCategory, ThemeTokenGroup>> &
  Readonly<Record<string, ThemeTokenGroup | undefined>>;
