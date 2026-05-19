import type { ReactNode } from "react";
import { createElement } from "react";

import type { BlockContext } from "./types.js";

export interface BlockNode {
  readonly id: string;
  readonly name: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export interface BlockNodeRenderProps<
  Attrs = Readonly<Record<string, unknown>>,
> {
  readonly attrs: Attrs;
  readonly context: BlockContext;
}

export type BlockNodeComponent<Attrs = Readonly<Record<string, unknown>>> = (
  props: BlockNodeRenderProps<Attrs>,
) => ReactNode;

export type BlockNodeRegistry = ReadonlyMap<string, BlockNodeComponent>;

const DEFAULT_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
};

export function renderBlockTree(
  nodes: readonly BlockNode[],
  registry: BlockNodeRegistry,
): ReactNode {
  return nodes.map((node) => {
    const Component = registry.get(node.name);
    if (!Component) return null;
    return createElement(Component, {
      key: node.id,
      attrs: node.attrs ?? {},
      context: DEFAULT_CONTEXT,
    });
  });
}
