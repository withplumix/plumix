import { renderToStaticMarkup } from "react-dom/server";

import type { MarkComponent, MarkRegistry, MarkSpec } from "../marks/types.js";
import type {
  BlockComponent,
  BlockContext,
  BlockRegistry,
  BlockSpec,
  TiptapNode,
} from "../types.js";
import { coreMarks } from "../marks/core/index.js";
import { mergeMarkRegistry } from "../marks/registry.js";
import { mergeBlockRegistry } from "../registry.js";
import { EntryContent } from "../walker.js";

// Resolved once at module load via top-level await so `renderBlock`
// can stay synchronous. Mirrors what `buildApp` does at runtime so
// the default test path renders marks identically to production.
const DEFAULT_MARK_REGISTRY: MarkRegistry = await mergeMarkRegistry({
  core: coreMarks,
  plugins: [],
  themeOverrides: {},
  themeId: null,
});

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

interface MockMarkRegistryInput {
  readonly core?: readonly MarkSpec[];
  readonly plugins?: readonly {
    readonly spec: MarkSpec;
    readonly pluginId: string;
  }[];
  readonly themeOverrides?: Readonly<Record<string, MarkComponent>>;
  readonly themeId?: string | null;
}

/**
 * Build a `MarkRegistry` from optional layer contributions. Mirrors
 * `mockRegistry`'s shape so tests that need both registries can use
 * the same call ergonomics.
 */
export async function mockMarkRegistry(
  input: MockMarkRegistryInput = {},
): Promise<MarkRegistry> {
  return mergeMarkRegistry({
    core: input.core ?? [],
    plugins: input.plugins ?? [],
    themeOverrides: input.themeOverrides ?? {},
    themeId: input.themeId ?? null,
  });
}

interface RenderBlockInput {
  readonly registry: BlockRegistry;
  /**
   * Mark registry. Omit to use a `coreMarks`-built default — the
   * common case for block tests that just need standard inline mark
   * rendering. Pass an explicit registry to exercise plugin marks
   * or theme overrides.
   */
  readonly markRegistry?: MarkRegistry;
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
      markRegistry: input.markRegistry ?? DEFAULT_MARK_REGISTRY,
      context: input.context ?? EMPTY_CONTEXT,
    }),
  );
}

export { DEFAULT_MARK_REGISTRY as defaultMarkRegistry, EMPTY_CONTEXT };
