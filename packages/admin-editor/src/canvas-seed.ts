import type {
  BlockNode,
  RenderEnv,
  ResolvedBlockLoaders,
} from "@plumix/core/blocks";
import {
  isEntryContent,
  parseLoaderData,
  parseRenderEnv,
} from "@plumix/core/blocks";

/** The text of the three JSON embeds the SSR render puts in the content root. */
export interface CanvasSeedEmbeds {
  readonly initialTree: string;
  readonly renderEnv: string;
  readonly loaderData: string;
}

/**
 * What the SSR render embedded, which the canvas, a fresh React tree with no
 * server context, would otherwise have to guess.
 */
export type CanvasSeed = RenderEnv & {
  readonly initialTree: readonly BlockNode[];
  readonly initialLoaderData: ResolvedBlockLoaders;
};

/** A malformed or wrong-kind embed seeds nothing rather than throwing. */
export function parseCanvasSeed({
  initialTree,
  renderEnv,
  loaderData,
}: CanvasSeedEmbeds): CanvasSeed {
  return {
    ...parseRenderEnv(renderEnv),
    initialTree: parseInitialTree(initialTree),
    initialLoaderData: parseLoaderData(loaderData),
  };
}

function parseInitialTree(json: string): readonly BlockNode[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return isEntryContent(parsed) ? parsed.blocks : [];
  } catch {
    return [];
  }
}
