import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { HtmlAllowlist } from "./html/sanitize.js";
import type { MarkRegistry } from "./marks/types.js";
import type {
  BlockContext,
  BlockRegistry,
  TiptapMark,
  TiptapNode,
} from "./types.js";
import { HtmlAllowlistProvider } from "./html/context.js";

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
}: EntryContentProps): ReactNode {
  if (!content) return null;
  const nodes = Array.isArray(content) ? content : [content];
  const tree = renderNodes(
    nodes,
    registry,
    markRegistry,
    context,
    devWarnState(registry),
  );
  if (htmlAllowlist === undefined) return tree;
  return createElement(HtmlAllowlistProvider, { value: htmlAllowlist }, tree);
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
): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((child, idx) =>
    createElement(
      Fragment,
      { key: idx },
      renderNode(child, registry, markRegistry, context, devState),
    ),
  );
}

function renderNode(
  node: TiptapNode,
  registry: BlockRegistry,
  markRegistry: MarkRegistry,
  context: BlockContext,
  devState: DevWarnState,
): ReactNode {
  if (node.type === "text") return renderText(node, markRegistry);
  if (node.type === "doc") {
    return renderNodes(node.content, registry, markRegistry, context, devState);
  }

  const spec = registry.get(node.type);
  if (!spec) return renderUnknown(node, devState);

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
  );
  return createElement(
    spec.component,
    { attrs: node.attrs ?? {}, node, context, children },
    children,
  );
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
