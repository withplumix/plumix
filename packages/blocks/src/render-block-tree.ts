import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { BlockRegistry } from "./block-registry.js";
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

function devWarnState(registry: BlockRegistry): DevWarnState {
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

function isBlockNodeArray(value: unknown): value is readonly BlockNode[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as BlockNode).id === "string" &&
      typeof (item as BlockNode).name === "string",
  );
}

function materializeSlots(
  attrs: Readonly<Record<string, unknown>>,
  registry: BlockRegistry,
  devState: DevWarnState,
  childContext: BlockContext,
): Readonly<Record<string, unknown>> {
  let materialized: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (isBlockNodeArray(value)) {
      materialized ??= { ...attrs };
      const children = value;
      materialized[key] = function SlotComponent() {
        return renderNodes(children, registry, devState, childContext);
      };
    }
  }
  return materialized ?? attrs;
}

function renderNodes(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
  devState: DevWarnState,
  context: BlockContext,
): ReactNode {
  return nodes.map((node) => {
    const spec = registry.get(node.name);
    if (!spec) {
      return createElement(
        Fragment,
        { key: node.id },
        renderUnknown(node.name, devState),
      );
    }
    const childContext: BlockContext = {
      ...context,
      parent: node.name,
      depth: context.depth + 1,
    };
    const attrs = materializeSlots(
      node.attrs ?? {},
      registry,
      devState,
      childContext,
    );
    const rendered = createElement(spec.render, { attrs, context });
    if (spec.inline) {
      return createElement(Fragment, { key: node.id }, rendered);
    }
    return createElement(
      "div",
      { key: node.id, "data-plumix-block": node.name },
      rendered,
    );
  });
}

export function renderBlockTree(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
): ReactNode {
  return renderNodes(nodes, registry, devWarnState(registry), DEFAULT_CONTEXT);
}
