import { createContext, type ReactNode, useContext } from "react";

import type { BlockRegistry } from "../block-registry.js";
import type { EntryContent } from "../entry-content.js";
import { renderBlockTree } from "../render-block-tree.js";
import type { ThemeTokens } from "../styles/types.js";

export interface PlumixContextValue {
  readonly registry: BlockRegistry;
  readonly tokens?: ThemeTokens;
}

const PlumixContext = createContext<PlumixContextValue | null>(null);

function usePlumixContext(consumer: string): PlumixContextValue {
  const ctx = useContext(PlumixContext);
  if (!ctx) {
    throw new Error(`${consumer} must be used inside a <PlumixProvider/>.`);
  }
  return ctx;
}

export function PlumixProvider({
  value,
  children,
}: {
  readonly value: PlumixContextValue;
  readonly children: ReactNode;
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
  return renderBlockTree(content.blocks, ctx.registry, { tokens: ctx.tokens });
}

export function useTokens(): ThemeTokens | undefined {
  return usePlumixContext("useTokens").tokens;
}
