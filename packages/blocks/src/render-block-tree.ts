import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

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

const DEFAULT_CONTEXT: BlockContext = Object.freeze({
  entry: null,
  siteSettings: Object.freeze({}),
  theme: null,
  parent: null,
  depth: 0,
});

interface DevWarnState {
  readonly seen: Set<string>;
}

const devWarnStates = new WeakMap<object, DevWarnState>();

function devWarnState(registry: BlockNodeRegistry): DevWarnState {
  let existing = devWarnStates.get(registry);
  if (!existing) {
    existing = { seen: new Set() };
    devWarnStates.set(registry, existing);
  }
  return existing;
}

function renderUnknown(name: string, devState: DevWarnState): ReactNode {
  if (!isDevMode()) return null;
  if (!devState.seen.has(name)) {
    devState.seen.add(name);
    console.warn(`[plumix:blocks] Unregistered block name: ${name}`);
  }
  return createElement("template", { "data-plumix-unknown-block": name });
}

function isDevMode(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NODE_ENV !== "production";
}

export function renderBlockTree(
  nodes: readonly BlockNode[],
  registry: BlockNodeRegistry,
): ReactNode {
  const devState = devWarnState(registry);
  return nodes.map((node) => {
    const Component = registry.get(node.name);
    if (!Component) {
      return createElement(
        Fragment,
        { key: node.id },
        renderUnknown(node.name, devState),
      );
    }
    return createElement(Component, {
      key: node.id,
      attrs: node.attrs ?? {},
      context: DEFAULT_CONTEXT,
    });
  });
}
