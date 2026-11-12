import { renderToStaticMarkup } from "react-dom/server";

import type { JsonObject } from "../../json.js";
import type { BlockSpec } from "../block-registry.js";
import type {
  BlockContext,
  BlockNode,
  RenderBlockTreeOptions,
} from "../render-block-tree.js";
import { createBlockRegistry } from "../block-registry.js";
import { loadBlockViews } from "../block-views.js";
import {
  DEFAULT_BLOCK_CONTEXT,
  renderBlockTree,
} from "../render-block-tree.js";

export { validateEntryContent as validateContent } from "../validate-content.js";
export { loadBlockViews } from "../block-views.js";

const EMPTY_CONTEXT: BlockContext = {
  entry: null,
  parent: null,
  depth: 0,
  locale: "en",
  shortcodes: null,
  editing: false,
  t: DEFAULT_BLOCK_CONTEXT.t,
};

export { EMPTY_CONTEXT };

interface MockRegistryInput {
  readonly specs?: readonly BlockSpec[];
}

/**
 * Build a `BlockRegistry` from an arbitrary spec list — convenience
 * wrapper over `createBlockRegistry` for tests that want to read
 * `.has(name)` etc. without re-importing the constructor every time.
 */
export function mockRegistry(input: MockRegistryInput = {}) {
  return createBlockRegistry(input.specs ?? []);
}

/**
 * Render a single block spec in isolation and return its HTML output, loading
 * its view module first. Useful for asserting a view against attrs fixtures.
 */
export async function renderBlockSpecToHtml(
  spec: BlockSpec,
  attrs?: JsonObject,
  options?: RenderBlockTreeOptions,
): Promise<string> {
  const registry = createBlockRegistry([spec]);
  await loadBlockViews(registry);
  const node: BlockNode = {
    id: "test-block",
    name: spec.name,
    attrs,
  };
  return renderToStaticMarkup(renderBlockTree([node], registry, options));
}

/**
 * Render a tree of BlockNodes against a list of specs and return the HTML,
 * loading their view modules first. Use for testing multi-block compositions
 * (slots, ordering, context).
 */
export async function renderBlockTreeToHtml(
  specs: readonly BlockSpec[],
  tree: readonly BlockNode[],
  options?: RenderBlockTreeOptions,
): Promise<string> {
  const registry = createBlockRegistry(specs);
  await loadBlockViews(registry);
  return renderToStaticMarkup(renderBlockTree(tree, registry, options));
}
