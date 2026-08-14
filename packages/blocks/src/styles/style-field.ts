import type { ThemeTokens, TokenCategory } from "./types.js";
import {
  normalizeStyleValue,
  tokenCategoryForProperty,
  tokenCssVar,
  tokenIdFromCssVar,
  tokenIdToCssVar,
} from "./style-emitter.js";

/** A caller's choice for one property: a theme token, or a raw CSS literal.
 *  This is the whole vocabulary the editor speaks — the `var()` encoding of a
 *  token stays behind the seam. */
export type StyleSelection =
  | { readonly kind: "token"; readonly id: string }
  | { readonly kind: "literal"; readonly value: string };

/** One offerable token in a field's scale. `label` is the Inspector display
 *  name; `cssVar` is the bare `var(--plumix-…)` (no fallback) for a raw-CSS
 *  view. */
export interface StyleTokenOption {
  readonly id: string;
  readonly label: string;
  readonly cssVar: string;
}

/** A single (property, tokens) style field: decode/encode a stored CSS value as
 *  a {@link StyleSelection}, plus the token scale a control renders. Callers
 *  never construct or parse a `var()` string. */
export interface StyleField {
  /** The property's resolved token category, or `undefined` when the property
   *  has no token scale. A read-only presentation hint — never needed to
   *  encode/decode. */
  readonly category: TokenCategory | undefined;
  /** True when the field's category is `color` (drives the swatch control). */
  readonly isColor: boolean;
  /** True when the theme offers at least one token for this field. */
  readonly hasTokens: boolean;
  /** Offerable tokens in theme registration order; empty when `!hasTokens`. */
  readonly options: readonly StyleTokenOption[];
  /** Decode a stored value into a selection; `null`/`""`/`undefined` → `null`
   *  (unset). A `var()` for this category → token (even a stale id); anything
   *  else → literal. */
  read(stored: string | null | undefined): StyleSelection | null;
  /** Encode a selection to the stored string, or `null` to clear. Faithful
   *  inverse of {@link read} for a fixed token set. */
  write(selection: StyleSelection | null): string | null;
  /** An option for any id, including one the theme no longer declares (label
   *  falls back to the id). Never throws. A bound function, so callers may pass
   *  it by reference. */
  readonly tokenOption: (id: string) => StyleTokenOption;
}

function buildField(
  property: string,
  tokens: ThemeTokens,
  categoryOverride: TokenCategory | undefined,
): StyleField {
  const category = categoryOverride ?? tokenCategoryForProperty(property);
  const group = category ? (tokens[category] ?? {}) : {};

  const tokenOption = (id: string): StyleTokenOption => ({
    id,
    label: group[id]?.label ?? id,
    // Tokens are only offered when the category is known; the bare-id fallback
    // is unreachable for a field with a scale, kept only to stay total.
    cssVar: category ? tokenCssVar(id, category) : id,
  });

  const options: readonly StyleTokenOption[] = category
    ? Object.keys(group).map(tokenOption)
    : [];

  return {
    category,
    isColor: category === "color",
    hasTokens: options.length > 0,
    options,
    read(stored) {
      const value = normalizeStyleValue(stored);
      if (value === null) return null;
      const id = category ? tokenIdFromCssVar(value, category) : null;
      return id !== null ? { kind: "token", id } : { kind: "literal", value };
    },
    write(selection) {
      if (selection === null) return null;
      if (selection.kind === "token") {
        return category
          ? tokenIdToCssVar(selection.id, category, tokens)
          : null;
      }
      return normalizeStyleValue(selection.value);
    },
    tokenOption,
  };
}

/** A theme-scoped builder: mint a {@link StyleField} for any property from one
 *  bound token set, sharing category resolution across every field. */
export interface StyleFields {
  field(
    property: string,
    opts?: { readonly category?: TokenCategory },
  ): StyleField;
}

export function createStyleFields(tokens: ThemeTokens): StyleFields {
  return {
    field: (property, opts) => buildField(property, tokens, opts?.category),
  };
}
