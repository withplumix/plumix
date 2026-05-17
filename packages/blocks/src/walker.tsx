import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { HtmlAllowlist } from "./html/sanitize.js";
import type { MarkRegistry } from "./marks/types.js";
import type { ThemeTokens } from "./styles/types.js";
import type {
  BlockContext,
  BlockRegistry,
  TiptapMark,
  TiptapNode,
} from "./types.js";
import { HtmlAllowlistProvider } from "./html/context.js";
import { ThemeTokensProvider } from "./styles/hooks.js";

/**
 * Minimum surface the walker needs from a hook executor: a synchronous
 * filter pipeline keyed by hook name. Defined structurally here so
 * `@plumix/blocks` stays free of a `@plumix/core` dependency — the core
 * package augments `FilterRegistry` for typed plugin authoring; the walker
 * just calls the structural method at render time.
 */
export interface SyncFilterExecutor {
  applyFilterSync<T>(name: string, value: T, ...rest: unknown[]): T;
}

export interface BlockRenderHookContext {
  readonly node: TiptapNode;
  readonly context: BlockContext;
}

export interface EntryContentProps {
  readonly content: TiptapNode | readonly TiptapNode[] | null | undefined;
  readonly registry: BlockRegistry;
  /**
   * Required. Inline marks render through this registry's resolved
   * components, with theme overrides already applied. Tests with no
   * marked text can pass an empty registry built via
   * `mockMarkRegistry()`; the `renderBlock` helper defaults to a
   * `coreMarks`-backed registry so most tests don't have to think
   * about it.
   */
  readonly markRegistry: MarkRegistry;
  readonly context: BlockContext;
  /**
   * DOMPurify allowlist consumed by `core/html` (and any future
   * block that opts into sanitized raw output). When supplied the
   * walker wraps its render tree in `<HtmlAllowlistProvider>` so the
   * html block reads the operator-configured allowlist rather than
   * the baseline default. Themes / SSR shells thread `app.htmlAllowlist`
   * through here.
   */
  readonly htmlAllowlist?: HtmlAllowlist;
  /**
   * Active theme's design tokens. When supplied the walker wraps its
   * render tree in `<ThemeTokensProvider>` so descendant blocks can
   * resolve their style slot through `useBlockStyles`. SSR shells
   * thread `app.themeTokens` through here.
   */
  readonly themeTokens?: ThemeTokens;
  /**
   * Optional hook executor invoked around each block render. When supplied
   * the walker fires `block:before_render` and `block:after_render` filter
   * hooks per block (in that order), threading
   * `{ node, context }: BlockRenderHookContext` as the second argument.
   * Hooks fire for the unknown-block fallback too — plugins can decorate
   * or replace whatever the walker is about to render.
   */
  readonly hooks?: SyncFilterExecutor;
}

/**
 * Recursive React SSR walker over a Tiptap doc.
 *
 * Resolves each non-text node through the block registry, dispatches
 * text + marks through the mark registry, and threads `BlockContext`
 * through the tree. Container blocks just render `{children}`; the
 * framework owns recursion so authors cannot drop content by forgetting
 * to recurse.
 *
 * Unknown nodes:
 * - In development: a `<template>` marker carrying the unknown name plus
 *   a one-time `console.warn` per unique name. Dedup state is keyed on
 *   the registry instance via a `WeakMap`.
 * - In production: render nothing.
 */
export function EntryContent({
  content,
  registry,
  markRegistry,
  context,
  htmlAllowlist,
  themeTokens,
  hooks,
}: EntryContentProps): ReactNode {
  if (!content) return null;
  const nodes = Array.isArray(content) ? content : [content];
  let tree: ReactNode = renderNodes(
    nodes,
    registry,
    markRegistry,
    context,
    devWarnState(registry),
    hooks,
  );
  if (htmlAllowlist !== undefined) {
    tree = createElement(HtmlAllowlistProvider, { value: htmlAllowlist }, tree);
  }
  if (themeTokens !== undefined) {
    tree = createElement(ThemeTokensProvider, {
      value: themeTokens,
      children: tree,
    });
  }
  return tree;
}

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

function renderNodes(
  nodes: readonly TiptapNode[] | undefined,
  registry: BlockRegistry,
  markRegistry: MarkRegistry,
  context: BlockContext,
  devState: DevWarnState,
  hooks: SyncFilterExecutor | undefined,
): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((child, idx) =>
    createElement(
      Fragment,
      { key: idx },
      renderNode(child, registry, markRegistry, context, devState, hooks),
    ),
  );
}

function renderNode(
  node: TiptapNode,
  registry: BlockRegistry,
  markRegistry: MarkRegistry,
  context: BlockContext,
  devState: DevWarnState,
  hooks: SyncFilterExecutor | undefined,
): ReactNode {
  if (node.type === "text") return renderText(node, markRegistry);
  if (node.type === "doc") {
    return renderNodes(
      node.content,
      registry,
      markRegistry,
      context,
      devState,
      hooks,
    );
  }

  const spec = registry.get(node.type);
  if (!spec) {
    return applyRenderHooks(
      renderUnknown(node, devState),
      node,
      context,
      hooks,
    );
  }

  const childContext: BlockContext = {
    ...context,
    parent: spec.name,
    depth: context.depth + 1,
  };
  const children = renderNodes(
    node.content,
    registry,
    markRegistry,
    childContext,
    devState,
    hooks,
  );
  const inner = createElement(
    spec.component,
    { attrs: node.attrs ?? {}, node, context, children },
    children,
  );
  const element = spec.client
    ? createElement(
        "div",
        {
          "data-plumix-island": spec.name,
          "data-plumix-island-attrs": JSON.stringify(node.attrs ?? {}),
        },
        inner,
      )
    : inner;
  return applyRenderHooks(element, node, context, hooks);
}

function applyRenderHooks(
  element: ReactNode,
  node: TiptapNode,
  context: BlockContext,
  hooks: SyncFilterExecutor | undefined,
): ReactNode {
  if (!hooks) return element;
  const ctx: BlockRenderHookContext = { node, context };
  const before = hooks.applyFilterSync<ReactNode>(
    "block:before_render",
    element,
    ctx,
  );
  return hooks.applyFilterSync<ReactNode>("block:after_render", before, ctx);
}

function renderText(node: TiptapNode, markRegistry: MarkRegistry): ReactNode {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.length === 0) return text;
  // Marks are stored outside-in; wrap inside-out so the innermost element
  // matches the first mark in the array.
  let element: ReactNode = text;
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    if (mark) element = wrapMark(element, mark, i, markRegistry);
  }
  return element;
}

function wrapMark(
  content: ReactNode,
  mark: TiptapMark,
  index: number,
  markRegistry: MarkRegistry,
): ReactNode {
  const spec = markRegistry.get(mark.type);
  if (!spec) return content;
  return createElement(spec.component, {
    key: `mark-${index}-${mark.type}`,
    attrs: mark.attrs ?? {},
    children: content,
  });
}

function renderUnknown(node: TiptapNode, devState: DevWarnState): ReactNode {
  if (isDevMode()) {
    if (!devState.seen.has(node.type)) {
      devState.seen.add(node.type);

      console.warn(`[plumix:blocks] Unregistered block type: ${node.type}`);
    }
    return createElement("template", {
      "data-plumix-unknown-block": node.type,
    });
  }
  return null;
}

function isDevMode(): boolean {
  // Cloudflare Workers may not expose `process` natively; guard the
  // access so the walker stays safe regardless of bundler / runtime.
  // Vite (the admin/runtime bundler) replaces this expression at build
  // time when it is processing the module.
  if (typeof process === "undefined") return false;
  return process.env.NODE_ENV !== "production";
}
