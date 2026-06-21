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
 * The theme's design vocabulary. Each group is a slug-keyed map of
 * `{ value, label? }`. All groups are optional — a theme that doesn't
 * declare a group just falls through to inline-style for that axis.
 */
export interface ThemeTokens {
  readonly colors?: ThemeTokenGroup;
  readonly spacing?: ThemeTokenGroup;
  readonly typography?: ThemeTokenGroup;
  readonly border?: ThemeTokenGroup;
  readonly radius?: ThemeTokenGroup;
  readonly shadow?: ThemeTokenGroup;
}
