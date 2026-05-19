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
  return nodes.map((node) => {
    hooks?.beforeRender?.(node, context);
    const spec = registry.get(node.name);
    if (!spec) {
      const unknownNode = createElement(
        Fragment,
        { key: node.id },
        renderUnknown(node.name, devState),
      );
      hooks?.afterRender?.(node, context);
      return unknownNode;
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
      const inlineEl = createElement(Fragment, { key: node.id }, rendered);
      hooks?.afterRender?.(node, context);
      return inlineEl;
    }
    const safeId = SAFE_ID_RE.test(node.id) ? node.id : null;
    const styleCss =
      safeId && node.style && tokens
        ? emitBlockStyleCss(`plumix-block-${safeId}`, node.style, tokens)
        : "";
    const className = styleCss ? `plumix-block-${safeId ?? ""}` : undefined;
    const styleTag = styleCss
      ? createElement("style", { key: "style" }, styleCss)
      : null;
    const wrappedEl = createElement(
      "div",
      {
        key: node.id,
        "data-plumix-block": node.name,
        className,
      },
      styleTag,
      rendered,
    );
    if (spec.client) {
      const hydrationScript = createElement("script", {
        key: "client-island",
        type: "module",
        src: spec.client.script,
      });
      hooks?.afterRender?.(node, context);
      return createElement(
        Fragment,
        { key: node.id },
        wrappedEl,
        hydrationScript,
      );
    }
    hooks?.afterRender?.(node, context);
    return wrappedEl;
  });
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
