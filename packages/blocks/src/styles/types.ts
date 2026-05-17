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

/**
 * Per-block declaration of which supports axes the spec opts into.
 * Each axis is independently optional. Authors flip the sub-axes they
 * want exposed in the Inspector and resolved by `resolveBlockStyles`.
 */
export interface BlockSupports {
  readonly color?: {
    readonly background?: boolean;
    readonly text?: boolean;
  };
  readonly spacing?: {
    readonly padding?: boolean;
    readonly margin?: boolean;
  };
  readonly typography?: {
    readonly fontSize?: boolean;
    readonly lineHeight?: boolean;
    readonly textAlign?: boolean;
    readonly fontWeight?: boolean;
  };
  readonly border?: {
    readonly radius?: boolean;
    readonly width?: boolean;
    readonly color?: boolean;
  };
  readonly align?: boolean;
  readonly anchor?: boolean;
  readonly customClassName?: boolean;
}

/**
 * Reserved `attrs.style.*` slot the Inspector and resolver read. Each
 * entry is either a token slug (`"primary"`, `"md"`) — which resolves
 * to a utility class — or a raw CSS value, which lands in inline
 * `style`. Both shapes coexist so authors can pick a theme token or
 * one-off value per attribute.
 */
export interface BlockStyleSlot {
  readonly color?: {
    readonly background?: string;
    readonly text?: string;
  };
  readonly spacing?: {
    readonly padding?: string;
    readonly margin?: string;
  };
  readonly typography?: {
    readonly fontSize?: string;
    readonly lineHeight?: string;
    readonly textAlign?: string;
    readonly fontWeight?: string;
  };
  readonly border?: {
    readonly radius?: string;
    readonly width?: string;
    readonly color?: string;
  };
  readonly align?: string;
  readonly anchor?: string;
  readonly customClassName?: string;
}
