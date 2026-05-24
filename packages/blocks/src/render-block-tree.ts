import type { ComponentType, ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { BlockRegistry } from "./block-registry.js";
import type { ResponsiveStyleSlot } from "./styles/style-emitter.js";
import type { ThemeTokens } from "./styles/types.js";
import { serializeProps } from "./serialize.js";
import { emitBlockStyleCss } from "./styles/style-emitter.js";

/**
 * Per-component manifest entry the Vite islands plugin produces at
 * build time. Keyed by the component reference (`spec.client.component`)
 * so the walker can resolve `chunkUrl` + `exportName` for any island
 * the registry contains. Phase F (`plugin-islands.ts`) populates this;
 * the walker reads it but never builds it.
 */
export interface IslandManifestEntry {
  readonly chunkUrl: string;
  readonly exportName: string;
}

export type IslandManifest = ReadonlyMap<
  ComponentType<Readonly<Record<string, unknown>>>,
  IslandManifestEntry
>;

/**
 * Threaded through `renderBlockTree` recursion. Block components introspect
 * it for placement-aware rendering — a block knows its full ancestry chain
 * without prop drilling.
 */
export interface BlockContext {
  readonly entry: Readonly<Record<string, unknown>> | null;
  readonly siteSettings: Readonly<Record<string, unknown>>;
  readonly theme: { readonly id: string } | null;
  /** Name of the immediate parent block, or `null` at the document root. */
  readonly parent: string | null;
  /** 0 at root, incremented for each container traversal. */
  readonly depth: number;
}

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
  readonly islandManifest?: IslandManifest;
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

export function isBlockNodeArray(
  value: unknown,
): value is readonly BlockNode[] {
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
  islandManifest: IslandManifest | undefined,
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
          islandManifest,
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
  islandManifest: IslandManifest | undefined,
): ReactNode {
  return nodes.map((node) => {
    hooks?.beforeRender?.(node, context);
    const result = renderNode(
      node,
      registry,
      devState,
      context,
      tokens,
      hooks,
      islandManifest,
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
  islandManifest: IslandManifest | undefined,
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
    islandManifest,
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

  // Client island? Wrap in `<plumix-island>` so the custom element
  // (`packages/blocks/src/island-element.ts`) can hydrate the React
  // component on the client. The walker only emits the wrapper when
  // a manifest entry exists for this block's `client.component`; a
  // build without the islands Vite plugin (or a block whose component
  // wasn't bundled) gracefully degrades to the SSR'd output without a
  // wrapper. Props from `node.attrs` are serialized to a sibling
  // `<script type="application/json">` rather than an attribute so
  // large prop graphs don't run into HTML attribute size limits.
  if (spec.client && islandManifest) {
    const entry = islandManifest.get(spec.client.component);
    if (entry) {
      return renderIsland({
        node,
        entry,
        hydrateWhen: spec.client.hydrateWhen ?? "load",
        className,
        styleTag,
        rendered,
        attrs,
        displayName: spec.client.component.displayName ?? spec.name,
      });
    }
  }

  return createElement(
    "div",
    {
      key: node.id,
      "data-plumix-block": node.name,
      className,
    },
    styleTag,
    rendered,
  );
}

interface RenderIslandArgs {
  readonly node: BlockNode;
  readonly entry: IslandManifestEntry;
  readonly hydrateWhen: string;
  readonly className: string | undefined;
  readonly styleTag: ReactNode;
  readonly rendered: ReactNode;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly displayName: string;
}

function renderIsland(args: RenderIslandArgs): ReactNode {
  const propsPayload = serializeProps(args.attrs, {
    displayName: args.displayName,
  });
  // Escape the JSON string against premature `</script>` termination —
  // a string prop containing `</script>` would otherwise close the
  // element here and let the rest of the JSON leak into the DOM as
  // markup. Forward-slash escape is safe inside JSON.
  const safePayload = propsPayload.replace(/<\/script/gi, "<\\/script");
  return createElement(
    Fragment,
    { key: args.node.id },
    createElement(
      "plumix-island",
      {
        "chunk-url": args.entry.chunkUrl,
        "component-export": args.entry.exportName,
        client: args.hydrateWhen,
        "data-plumix-block": args.node.name,
        // `ssr` marks the wrapper as SSR'd-but-not-yet-hydrated. The
        // custom element removes it after `hydrate()` runs. Nested
        // islands check this attribute on their closest ancestor and
        // defer their own start() until the parent clears it — keeps
        // the top-down hydration order React expects when a parent
        // island can re-render and swap out a child.
        ssr: "",
        className: args.className,
      },
      args.styleTag,
      args.rendered,
    ),
    createElement("script", {
      type: "application/json",
      "data-plumix-island-props": "",
      dangerouslySetInnerHTML: { __html: safePayload },
    }),
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
    options?.islandManifest,
  );
}
