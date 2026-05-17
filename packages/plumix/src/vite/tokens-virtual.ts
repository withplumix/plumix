import type { ThemeTokens } from "@plumix/blocks";
import { tokensToCss } from "@plumix/blocks";

/**
 * Public id consumers import: `import "virtual:plumix/blocks/tokens.css"`.
 * The Vite plugin's `resolveId` hook turns this into the resolved id
 * below (prefixed with `\0` so Vite skips other resolvers).
 */
export const TOKENS_VIRTUAL_ID = "virtual:plumix/blocks/tokens.css";
export const TOKENS_RESOLVED_ID = "\0virtual:plumix/blocks/tokens.css";

export function resolveTokensVirtualId(id: string): string | undefined {
  return id === TOKENS_VIRTUAL_ID ? TOKENS_RESOLVED_ID : undefined;
}

/**
 * Produce the stylesheet contents at load time from the active theme's
 * tokens. Empty tokens (or absent theme) emit an empty string so the
 * `.css` import always succeeds — the active theme just contributes
 * nothing to the bundle.
 */
export function loadTokensVirtual(
  id: string,
  tokens: ThemeTokens | undefined,
): string | undefined {
  if (id !== TOKENS_RESOLVED_ID) return undefined;
  if (!tokens) return "";
  return tokensToCss(tokens);
}
