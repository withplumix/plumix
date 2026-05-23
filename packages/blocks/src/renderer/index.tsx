import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { BlockRegistry } from "../block-registry.js";
import type { EntryContent } from "../entry-content.js";
import type { ThemeTokens } from "../styles/types.js";
import { renderBlockTree } from "../render-block-tree.js";
import { RendererError } from "./errors.js";

export interface PlumixContextValue {
  readonly registry: BlockRegistry;
  readonly tokens?: ThemeTokens;
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
