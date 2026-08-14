import { useState } from "react";

import type { StyleTokenOption, TokenCategory } from "@plumix/blocks";

import { useStyleFields } from "./style-fields-context.js";

export interface UseStyleFieldOptions {
  /** Emits the next stored CSS value, or `null` to clear the property. */
  readonly onChange: (value: string | null) => void;
  /** Fix the token scale to this category instead of deriving it from the
   *  property — for a control owned by a section (e.g. a color picker). */
  readonly category?: TokenCategory;
  /** Whether clearing the custom input to empty clears the property (default)
   *  or keeps an empty declaration. The declarations repeater keeps it so the
   *  focused row doesn't unmount. */
  readonly emptyLiteralClears?: boolean;
  /** Suppress the token scale entirely — a custom-only control that never
   *  offers tokens, even for a property the model could derive a scale for
   *  (e.g. max-width). A stored `var()` then shows as its raw literal text. */
  readonly literalOnly?: boolean;
}

export interface StyleFieldState {
  readonly category: TokenCategory | undefined;
  readonly isColor: boolean;
  readonly hasTokens: boolean;
  readonly options: readonly StyleTokenOption[];
  /** The selected token id, or `null` for a literal / unset value. */
  readonly tokenId: string | null;
  /** The literal text to show in a custom input (`""` for a token / unset). */
  readonly literalText: string;
  /** Which input the control shows. Follows the value's kind when set; falls
   *  back to the user's last toggle when the value is unset. */
  readonly mode: "token" | "custom";
  /** Switch the shown input, clearing a value the target mode can't hold. */
  setMode(mode: "token" | "custom"): void;
  setToken(id: string): void;
  setLiteral(text: string): void;
  clear(): void;
  tokenOption(id: string): StyleTokenOption;
}

/**
 * The state and writers for one style property, over the theme-scoped
 * {@link StyleFields} from context. Hides the token/literal encoding and the
 * Token/Custom mode machine — a control renders `mode`/`tokenId`/`options` and
 * calls the writers, never touching a `var()` string.
 */
export function useStyleField(
  property: string,
  value: string | undefined,
  {
    onChange,
    category,
    emptyLiteralClears = true,
    literalOnly = false,
  }: UseStyleFieldOptions,
): StyleFieldState {
  const field = useStyleFields().field(property, { category });
  // A custom-only control ignores any derivable scale: no tokens, and a stored
  // value (even a `var()`) reads and writes as raw literal text.
  const selection = literalOnly ? null : field.read(value);
  const tokenizable = !literalOnly && field.category !== undefined;
  const hasTokens = !literalOnly && field.hasTokens;
  const [pref, setPref] = useState<"token" | "custom">(
    hasTokens ? "token" : "custom",
  );

  const resolveMode = (): "token" | "custom" => {
    if (!tokenizable) return "custom";
    if (!selection) return pref;
    return selection.kind === "token" ? "token" : "custom";
  };

  const resolveLiteralText = (): string => {
    if (literalOnly) return value ?? "";
    return selection?.kind === "literal" ? selection.value : "";
  };

  return {
    category: field.category,
    isColor: !literalOnly && field.isColor,
    hasTokens,
    options: literalOnly ? [] : field.options,
    tokenId: selection?.kind === "token" ? selection.id : null,
    literalText: resolveLiteralText(),
    mode: resolveMode(),
    setMode(next) {
      setPref(next);
      // Drop a value the target mode can't represent, so the other input
      // isn't shadowed by a value it can't show.
      if (next === "token" && selection?.kind === "literal") onChange(null);
      if (next === "custom" && selection?.kind === "token") onChange(null);
    },
    setToken(id) {
      onChange(field.write({ kind: "token", id }));
    },
    setLiteral(text) {
      if (text === "" && !emptyLiteralClears) {
        onChange("");
        return;
      }
      onChange(field.write({ kind: "literal", value: text }));
    },
    clear() {
      onChange(null);
    },
    tokenOption: field.tokenOption,
  };
}
