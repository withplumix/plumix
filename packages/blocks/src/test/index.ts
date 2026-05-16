import { renderToStaticMarkup } from "react-dom/server";

import type {
  BlockComponent,
  BlockContext,
  BlockRegistry,
  BlockSpec,
  TiptapNode,
} from "../types.js";
import { mergeBlockRegistry } from "../registry.js";
import { EntryContent } from "../walker.js";

const EMPTY_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
};

interface MockRegistryInput {
  readonly core?: readonly BlockSpec[];
  readonly plugins?: readonly {
    readonly spec: BlockSpec;
    readonly pluginId: string;
  }[];
  readonly themeOverrides?: Readonly<Record<string, BlockComponent>>;
  readonly themeId?: string | null;
}

/**
 * Build a `BlockRegistry` from optional layer contributions. Defaults
 * everything to empty so callers only supply the layer(s) they need.
 *
 * Returns the same merged registry shape the runtime uses, with the
 * async resolution awaited so test bodies can stay synchronous.
 */
export async function mockRegistry(
  input: MockRegistryInput = {},
): Promise<BlockRegistry> {
  return mergeBlockRegistry({
    core: input.core ?? [],
    plugins: input.plugins ?? [],
    themeOverrides: input.themeOverrides ?? {},
    themeId: input.themeId ?? null,
  });
}

interface RenderBlockInput {
  readonly registry: BlockRegistry;
  readonly content: TiptapNode | readonly TiptapNode[];
  readonly context?: BlockContext;
}

/**
 * Server-render a Tiptap doc through `<EntryContent>` into an HTML
 * string. Useful for asserting expected output without spinning up a
 * full React testing-library harness.
 */
export function renderBlock(input: RenderBlockInput): string {
  return renderToStaticMarkup(
    EntryContent({
      content: input.content,
      registry: input.registry,
      context: input.context ?? EMPTY_CONTEXT,
    }),
  );
}

export { EMPTY_CONTEXT };
