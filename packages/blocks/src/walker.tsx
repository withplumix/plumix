import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type {
  BlockContext,
  BlockRegistry,
  TiptapMark,
  TiptapNode,
} from "./types.js";

export interface EntryContentProps {
  readonly content: TiptapNode | readonly TiptapNode[] | null | undefined;
  readonly registry: BlockRegistry;
  readonly context: BlockContext;
}

/**
 * Recursive React SSR walker over a Tiptap doc.
 *
 * Resolves each non-text node through the merged registry, dispatches
 * text + marks through the inline walker, and threads `BlockContext`
 * through the tree. Container blocks just render `{children}`; the
 * framework owns recursion so authors cannot drop content by forgetting
 * to recurse (FaustJS pattern).
 *
 * Unknown nodes:
 * - In development: a `<template>` marker carrying the unknown name plus
 *   a one-time `console.warn` per unique name. Dedup state is keyed on
 *   the registry instance via a `WeakMap`, so the warn fires once per
 *   registry per page render even when the same unknown block appears
 *   many times.
 * - In production: render nothing — no DOM artifact, no log.
 *
 * Stored content is preserved untouched by the persistence layer; the
 * walker only decides what to render.
 */
export function EntryContent({
  content,
  registry,
  context,
}: EntryContentProps): ReactNode {
  if (!content) return null;
  const nodes = Array.isArray(content) ? content : [content];
  return renderNodes(nodes, registry, context, devWarnState(registry));
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
  context: BlockContext,
  devState: DevWarnState,
): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((child, idx) =>
    createElement(
      Fragment,
      { key: idx },
      renderNode(child, registry, context, devState),
    ),
  );
}

function renderNode(
  node: TiptapNode,
  registry: BlockRegistry,
  context: BlockContext,
  devState: DevWarnState,
): ReactNode {
  if (node.type === "text") return renderText(node);
  if (node.type === "doc") {
    return renderNodes(node.content, registry, context, devState);
  }

  const spec = registry.get(node.type);
  if (!spec) return renderUnknown(node, devState);

  const childContext: BlockContext = {
    ...context,
    parent: spec.name,
    depth: context.depth + 1,
  };
  const children = renderNodes(node.content, registry, childContext, devState);
  return createElement(
    spec.component,
    { attrs: node.attrs ?? {}, node, context, children },
    children,
  );
}

function renderText(node: TiptapNode): ReactNode {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.length === 0) return text;
  // Marks are stored outside-in; wrap inside-out so the innermost element
  // matches the first mark in the array.
  let element: ReactNode = text;
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    if (mark) element = wrapMark(element, mark, i);
  }
  return element;
}

function wrapMark(
  content: ReactNode,
  mark: TiptapMark,
  index: number,
): ReactNode {
  const key = `mark-${index}-${mark.type}`;
  switch (mark.type) {
    case "bold":
      return createElement("strong", { key }, content);
    case "italic":
      return createElement("em", { key }, content);
    case "strike":
      return createElement("s", { key }, content);
    case "code":
      return createElement("code", { key }, content);
    case "link": {
      const href = sanitizeHref(mark.attrs?.href);
      if (href === null) return content;
      return createElement(
        "a",
        { key, href, rel: "noopener noreferrer nofollow" },
        content,
      );
    }
    default:
      return content;
  }
}

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

function sanitizeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (trimmed === "") return null;
  return SAFE_HREF.test(trimmed) ? trimmed : null;
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
