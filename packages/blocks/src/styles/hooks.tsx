import type { CSSProperties, ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

import type { ResolvedBlockStyles } from "./resolve-block-styles.js";
import type { BlockStyleSlot, BlockSupports, ThemeTokens } from "./types.js";
import { resolveBlockStyles } from "./resolve-block-styles.js";

const EMPTY_TOKENS: ThemeTokens = Object.freeze({});

const ThemeTokensContext = createContext<ThemeTokens>(EMPTY_TOKENS);

export interface ThemeTokensProviderProps {
  readonly value: ThemeTokens;
  readonly children: ReactNode;
}

/**
 * Provides the active theme's tokens to descendant blocks. The SSR
 * shell mounts this once around `<EntryContent>` so every block can
 * resolve its style slot through `useBlockStyles`. Themes without
 * tokens declared just don't mount a provider — defaults fall through
 * to empty tokens and the resolver degrades to inline `style` only.
 */
export function ThemeTokensProvider({
  value,
  children,
}: ThemeTokensProviderProps): ReactElement {
  return (
    <ThemeTokensContext.Provider value={value}>
      {children}
    </ThemeTokensContext.Provider>
  );
}

/**
 * Returns the active theme's tokens. Without a provider the default
 * is the frozen empty tokens object — callers can safely read groups
 * (`tokens.colors`) without nil-checking the parent.
 */
export function useThemeTokens(): ThemeTokens {
  return useContext(ThemeTokensContext);
}

/**
 * Convenience hook over `resolveBlockStyles` that pulls tokens from
 * context. The memo dependency on `slot` / `supports` / `tokens`
 * keeps the resolver output stable for spread onto a memoised root.
 */
export function useBlockStyles(
  slot: BlockStyleSlot,
  supports: BlockSupports,
): ResolvedBlockStyles {
  const tokens = useThemeTokens();
  return useMemo(
    () => resolveBlockStyles(slot, supports, tokens),
    [slot, supports, tokens],
  );
}

/**
 * Picks only the non-empty fields from a `ResolvedBlockStyles` so the
 * spread on a JSX root doesn't emit `className=""` or `style={}` — the
 * walker's snapshot tests assert exact HTML without empty attributes.
 *
 * `name` stamps the canonical `data-plumix-block` identity attribute
 * (load-bearing for `parseHTML` round-trip + walker dispatch).
 * `moduleClass` is the block's own static class string (e.g.
 * `"plumix-heading plumix-h2"`) so the visual identity ships with the
 * block, not with the host.
 */
export function blockElementProps(
  resolved: ResolvedBlockStyles,
  opts: { readonly name?: string; readonly moduleClass?: string } = {},
): {
  id?: string;
  className?: string;
  style?: CSSProperties;
  "data-plumix-block"?: string;
} {
  const props: {
    id?: string;
    className?: string;
    style?: CSSProperties;
    "data-plumix-block"?: string;
  } = {};
  if (resolved.id !== undefined) props.id = resolved.id;
  const merged = [opts.moduleClass, resolved.className]
    .filter((c): c is string => Boolean(c && c.length > 0))
    .join(" ");
  if (merged.length > 0) props.className = merged;
  if (Object.keys(resolved.style).length > 0) props.style = resolved.style;
  if (opts.name !== undefined) props["data-plumix-block"] = opts.name;
  return props;
}
