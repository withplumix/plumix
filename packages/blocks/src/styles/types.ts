/**
 * One entry in a token group. `value` is the CSS value the browser
 * receives (hex/rgb for colors, length string for spacing, etc.).
 * `label` is the human-readable name the Inspector picker shows;
 * defaults to the slug when omitted.
 */
export interface ThemeTokenEntry {
  readonly value: string;
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
}
