import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { BlockRegistry } from "../block-registry.js";
import type { EntryContent } from "../entry-content.js";
import type { ResolvedBlockLoaders } from "../loaders.js";
import type { ShortcodeRegistry } from "../shortcodes/types.js";
import type { ThemeTokens } from "../styles/types.js";
import { renderBlockTree } from "../render-block-tree.js";
import { RendererError } from "./errors.js";

// `@plumix/core` depends on `@plumix/blocks`, not the reverse — these
// mirror `AuthenticatedUser` / `ResolvedEntity` structurally.
export interface RendererUser {
  readonly id: number;
  readonly email: string;
  readonly role: string;
  readonly meta: Record<string, unknown>;
}

export type RendererQueriedEntry =
  | { readonly kind: "entry"; readonly id: number }
  | { readonly kind: "term"; readonly id: number }
  | { readonly kind: "archive"; readonly entryType: string };

export interface PlumixContextValue {
  readonly registry: BlockRegistry;
  readonly tokens?: ThemeTokens;
  readonly loaderData?: ResolvedBlockLoaders;
  readonly user?: RendererUser | null;
  readonly queriedEntry?: RendererQueriedEntry | null;
  /** Render locale, threaded to the walker for shortcode/`Intl` output. */
  readonly locale?: string;
  /** Registered shortcodes for rich-text body expansion. */
  readonly shortcodes?: ShortcodeRegistry;
  /** Queried entry, exposed to body shortcodes via `BlockContext.entry`. */
  readonly entry?: Readonly<Record<string, unknown>> | null;
}

const PlumixContext = createContext<PlumixContextValue | null>(null);

function usePlumixContext(consumer: string): PlumixContextValue {
  const ctx = useContext(PlumixContext);
  if (!ctx) {
    throw RendererError.missingProvider({ consumer });
  }
  return ctx;
}

export function PlumixProvider({
  value,
  children,
}: {
  readonly value: PlumixContextValue;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <PlumixContext.Provider value={value}>{children}</PlumixContext.Provider>
  );
}

export function BlockRenderer({
  content,
}: {
  readonly content: EntryContent;
}): ReactNode {
  const ctx = usePlumixContext("BlockRenderer");
  return renderBlockTree(content.blocks, ctx.registry, {
    tokens: ctx.tokens,
    loaderData: ctx.loaderData,
    locale: ctx.locale,
    shortcodes: ctx.shortcodes,
    entry: ctx.entry,
  });
}

export function useTokens(): ThemeTokens | undefined {
  return usePlumixContext("useTokens").tokens;
}

export function useUser(): RendererUser | null {
  return usePlumixContext("useUser").user ?? null;
}

export function useQueriedEntry(): RendererQueriedEntry | null {
  return usePlumixContext("useQueriedEntry").queriedEntry ?? null;
}
