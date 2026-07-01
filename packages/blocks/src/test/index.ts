import { renderToStaticMarkup } from "react-dom/server";

import type { BlockSpec } from "../block-registry.js";
import type {
  BlockContext,
  BlockNode,
  RenderBlockTreeOptions,
} from "../render-block-tree.js";
import { createBlockRegistry } from "../block-registry.js";
import { renderBlockTree } from "../render-block-tree.js";

export { validateEntryContent as validateContent } from "../validate-content.js";

const EMPTY_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
  locale: "en",
  shortcodes: null,
  editing: false,
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
 * Render a single block spec in isolation and return its HTML output.
 * Useful for asserting `defineBlock.render` output against attrs fixtures.
 */
export function renderBlockSpecToHtml(
  spec: BlockSpec,
  attrs?: Readonly<Record<string, unknown>>,
  options?: RenderBlockTreeOptions,
): string {
  const registry = createBlockRegistry([spec]);
  const node: BlockNode = {
    id: "test-block",
    name: spec.name,
    attrs,
  };
  return renderToStaticMarkup(renderBlockTree([node], registry, options));
}

/**
 * Render a tree of BlockNodes against a list of specs and return the HTML.
 * Use for testing multi-block compositions (slots, ordering, context).
 */
export function renderBlockTreeToHtml(
  specs: readonly BlockSpec[],
  tree: readonly BlockNode[],
  options?: RenderBlockTreeOptions,
): string {
  const registry = createBlockRegistry(specs);
  return renderToStaticMarkup(renderBlockTree(tree, registry, options));
}
