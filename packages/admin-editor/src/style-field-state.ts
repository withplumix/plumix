import type {
  StyleField,
  StyleTokenOption,
  TokenCategory,
} from "@plumix/core/blocks";

export type StyleFieldMode = "token" | "custom";

export interface StyleFieldStateOptions {
  /** Emits the next stored CSS value, or `null` to clear the property. */
  readonly onChange: (value: string | null) => void;
  /** Records the user's last mode toggle, which an unset value falls back to. */
  readonly onPreferredModeChange: (mode: StyleFieldMode) => void;
  /** Whether clearing the custom input to empty clears the property (default)
   *  or keeps an empty declaration. The declarations repeater keeps it so the
   *  focused row doesn't unmount. */
  readonly emptyLiteralClears?: boolean;
  /**
   * Suppresses tokens even where a scale exists; a stored `var()` shows as raw
   * text.
   */
  readonly literalOnly?: boolean;
  /** The value a wider device sets, which this one renders while it has none
   *  of its own (styles cascade desktop-first). */
  readonly inherited?: string;
  /** The style policy's answer for this property; `true` when omitted. */
  readonly customAllowed?: boolean;
  /** Whether the policy refuses the value stored here. */
  readonly refused?: boolean;
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
  /** What the inherited value reads as — a literal as written, a token by its
   *  label — or `""` when the value is set here or nothing is inherited. */
  readonly inheritedText: string;
  /** Which input the control shows. Follows the value's kind when set; falls
   *  back to the user's last toggle when the value is unset. */
  readonly mode: StyleFieldMode;
  /** Whether the control offers the Custom input at all. */
  readonly offersCustom: boolean;
  /** A stored value the policy refuses, shown read-only; `null` otherwise. */
  readonly forbiddenText: string | null;
  /** Tokens only, no tokens to offer and nothing refused stored. */
  readonly hidden: boolean;
  /** Switch the shown input, clearing a value the target mode can't hold. */
  setMode(mode: StyleFieldMode): void;
  setToken(id: string): void;
  setLiteral(text: string): void;
  clear(): void;
  tokenOption(id: string): StyleTokenOption;
}

/**
 * A style control's state over one field. `preferredMode` is the user's last
 * toggle, `undefined` until they make one: the mode then defaults to tokens
 * wherever the field offers any.
 */
export function styleFieldState(
  field: StyleField,
  value: string | undefined,
  preferredMode: StyleFieldMode | undefined,
  {
    onChange,
    onPreferredModeChange,
    emptyLiteralClears = true,
    literalOnly = false,
    inherited,
    customAllowed = true,
    refused = false,
  }: StyleFieldStateOptions,
): StyleFieldState {
  // A custom-only control ignores any derivable scale: no tokens, and a stored
  // value (even a `var()`) reads and writes as raw literal text.
  const selection = literalOnly ? null : field.read(value);
  const tokenizable = !literalOnly && field.category !== undefined;
  const hasTokens = !literalOnly && field.hasTokens;
  const pref = preferredMode ?? (hasTokens ? "token" : "custom");

  const forbiddenText = refused ? (value ?? null) : null;

  const resolveMode = (): StyleFieldMode => {
    if (!customAllowed) return "token";
    if (!tokenizable) return "custom";
    if (!selection) return pref;
    return selection.kind === "token" ? "token" : "custom";
  };

  const resolveInheritedText = (): string => {
    if (value !== undefined || inherited === undefined) return "";
    if (literalOnly) return inherited;
    const from = field.read(inherited);
    if (!from) return "";
    return from.kind === "token"
      ? field.tokenOption(from.id).label
      : from.value;
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
    tokenId:
      selection?.kind === "token" && forbiddenText === null
        ? selection.id
        : null,
    literalText: resolveLiteralText(),
    inheritedText: resolveInheritedText(),
    mode: resolveMode(),
    offersCustom: customAllowed,
    forbiddenText,
    hidden: !customAllowed && !hasTokens && forbiddenText === null,
    setMode(next) {
      onPreferredModeChange(next);
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
