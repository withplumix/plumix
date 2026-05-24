import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { BlockRegistry } from "../block-registry.js";
import type { EntryContent } from "../entry-content.js";
import type { IslandManifest } from "../render-block-tree.js";
import type { ThemeTokens } from "../styles/types.js";
import { renderBlockTree } from "../render-block-tree.js";
import { RendererError } from "./errors.js";

export interface PlumixContextValue {
  readonly registry: BlockRegistry;
  readonly tokens?: ThemeTokens;
  /**
   * Map from each block-island `ComponentType` reference to its
   * `{ chunkUrl, exportName }` entry. Populated by the SSR worker from
   * `virtual:plumix/island-manifest`; the walker uses it to emit a
   * `<plumix-island>` wrapper around blocks declaring `client`.
   * Optional so consumers that never use islands (or pre-islands
   * builds) compile cleanly.
   */
  readonly islandManifest?: IslandManifest;
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
  return renderBlockTree(content.blocks, ctx.registry, {
    tokens: ctx.tokens,
    islandManifest: ctx.islandManifest,
  });
}

export function useTokens(): ThemeTokens | undefined {
  return usePlumixContext("useTokens").tokens;
}
