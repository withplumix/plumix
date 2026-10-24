/** One capability per line, trimmed, blank lines dropped. */
export function parseScopesText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type TokenPreset = "read_only" | "draft_only";

export type TokenScopeMode = "inherit" | TokenPreset | "restrict";

export interface TokenGrant {
  readonly scopes: string[] | null;
  readonly preset?: TokenPreset;
}

export function tokenGrantOf(
  mode: TokenScopeMode,
  scopesText: string,
): TokenGrant {
  switch (mode) {
    case "inherit":
      return { scopes: null };
    case "restrict":
      return { scopes: parseScopesText(scopesText) };
    case "read_only":
    case "draft_only":
      return { scopes: null, preset: mode };
  }
}
