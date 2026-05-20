import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { BlockRegistry } from "./block-registry.js";
import type { ResponsiveStyleSlot } from "./styles/style-emitter.js";
import type { ThemeTokens } from "./styles/types.js";
import type { BlockContext } from "./types.js";
import { emitBlockStyleCss } from "./styles/style-emitter.js";

export interface BlockNode {
  readonly id: string;
  readonly name: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly style?: ResponsiveStyleSlot;
}

/**
 * Walker-traversal hooks, fired at tree-construction time (NOT post-order).
 * Both callbacks fire synchronously around each `BlockNode`'s React element
 * construction — `beforeRender` immediately before, `afterRender` immediately
 * after. Slot children render lazily inside React (the slot's `<Content />`
 * invocation), so a parent's `afterRender` fires before its children's
 * `beforeRender`. For plugins that need post-order semantics (decorate around
 * children), this contract isn't the right primitive — observe the React
 * tree directly instead.
 */
export interface BlockRenderHooks {
  readonly beforeRender?: (node: BlockNode, context: BlockContext) => void;
  readonly afterRender?: (node: BlockNode, context: BlockContext) => void;
}

export interface RenderBlockTreeOptions {
  readonly tokens?: ThemeTokens;
  readonly hooks?: BlockRenderHooks;
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

export const DEFAULT_BLOCK_CONTEXT: BlockContext = Object.freeze({
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

const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/;

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

export function isBlockNodeArray(value: unknown): value is readonly BlockNode[] {
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
  tokens: ThemeTokens | undefined,
  hooks: BlockRenderHooks | undefined,
): Readonly<Record<string, unknown>> {
  let materialized: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (isBlockNodeArray(value)) {
      materialized ??= { ...attrs };
      materialized[key] = function SlotComponent() {
        return renderNodes(
          value,
          registry,
          devState,
          childContext,
          tokens,
          hooks,
        );
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
  tokens: ThemeTokens | undefined,
  hooks: BlockRenderHooks | undefined,
): ReactNode {
  const seenScripts = new Set<string>();
  return nodes.map((node) => {
    hooks?.beforeRender?.(node, context);
    const result = renderNode(
      node,
      registry,
      devState,
      context,
      tokens,
      hooks,
      seenScripts,
    );
    hooks?.afterRender?.(node, context);
    return result;
  });
}

function renderNode(
  node: BlockNode,
  registry: BlockRegistry,
  devState: DevWarnState,
  context: BlockContext,
  tokens: ThemeTokens | undefined,
  hooks: BlockRenderHooks | undefined,
  seenScripts: Set<string>,
): ReactNode {
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
    tokens,
    hooks,
  );
  const rendered = createElement(spec.render, { attrs, context });
  if (spec.inline) {
    return createElement(Fragment, { key: node.id }, rendered);
  }
  const safeId = SAFE_ID_RE.test(node.id) ? node.id : null;
  const styleCss =
    safeId && node.style && tokens
      ? emitBlockStyleCss(`plumix-block-${safeId}`, node.style, tokens)
      : "";
  const className = safeId && styleCss ? `plumix-block-${safeId}` : undefined;
  const styleTag = styleCss
    ? createElement("style", { key: "style" }, styleCss)
    : null;
  const wrappedEl = createElement(
    "div",
    {
      key: node.id,
      "data-plumix-block": node.name,
      "data-plumix-island": spec.client ? node.name : undefined,
      className,
    },
    styleTag,
    rendered,
  );
  if (!spec.client) return wrappedEl;
  // Dedupe per-renderNodes-call so N instances of the same client block ship
  // one <script type="module">, not N. The module loader already dedupes
  // execution by URL; this avoids shipping the tag at all for siblings.
  if (seenScripts.has(spec.client.script)) return wrappedEl;
  seenScripts.add(spec.client.script);
  const hydrationScript = createElement("script", {
    key: "client-island",
    type: "module",
    src: spec.client.script,
  });
  return createElement(
    Fragment,
    { key: node.id },
    wrappedEl,
    hydrationScript,
  );
}

export function renderBlockTree(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
  options?: RenderBlockTreeOptions,
): ReactNode {
  return renderNodes(
    nodes,
    registry,
    devWarnState(registry),
    DEFAULT_BLOCK_CONTEXT,
    options?.tokens,
    options?.hooks,
  );
}
