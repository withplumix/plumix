import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { BlockRegistry } from "./block-registry.js";
import type {
  BlockLoaderRecord,
  ResolvedBlockLoaders,
  ResolvedLoaders,
} from "./loaders.js";
import type { PatternRegistry } from "./pattern-registry.js";
import type { ShortcodeRegistry } from "./shortcodes/types.js";
import type {
  ResponsiveStyleSlot,
  ThemeBreakpoints,
} from "./styles/style-emitter.js";
import type { ThemeTokens } from "./styles/types.js";
import { emitBlockStyleCss } from "./styles/style-emitter.js";

const PATTERN_REF_BLOCK = "core/pattern-ref";

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
  /** Active render locale, threaded for shortcode/`Intl` localization. */
  readonly locale: string;
  /**
   * Registry of registered shortcodes for authored-content expansion, or
   * `null` when the host wired none (the body then renders verbatim).
   */
  readonly shortcodes: ShortcodeRegistry | null;
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
  /** Theme breakpoints driving the emitter's @media maxima (default 991/640). */
  readonly breakpoints?: ThemeBreakpoints;
  readonly hooks?: BlockRenderHooks;
  readonly loaderData?: ResolvedBlockLoaders;
  readonly patterns?: PatternRegistry;
  /** Render locale for shortcode/`Intl` localization. Defaults to `"en"`. */
  readonly locale?: string;
  /** Registered shortcodes for authored-content body expansion. */
  readonly shortcodes?: ShortcodeRegistry;
  /** Queried entry, exposed to shortcodes via `BlockContext.entry`. */
  readonly entry?: Readonly<Record<string, unknown>> | null;
  /** Edit mode: tag each block wrapper with `data-plumix-id` for canvas selection. */
  readonly editing?: boolean;
}

export interface BlockNodeRenderProps<
  Attrs = Readonly<Record<string, unknown>>,
  Loaders extends BlockLoaderRecord = BlockLoaderRecord,
> {
  readonly attrs: Attrs;
  readonly context: BlockContext;
  readonly loaders: ResolvedLoaders<Loaders>;
}

export type BlockNodeComponent<
  Attrs = Readonly<Record<string, unknown>>,
  Loaders extends BlockLoaderRecord = BlockLoaderRecord,
> = (props: BlockNodeRenderProps<Attrs, Loaders>) => ReactNode;

export const DEFAULT_BLOCK_CONTEXT: BlockContext = Object.freeze({
  entry: null,
  siteSettings: Object.freeze({}),
  theme: null,
  parent: null,
  depth: 0,
  locale: "en",
  shortcodes: null,
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
  node: BlockNode,
  env: WalkerEnv,
  childContext: BlockContext,
): Readonly<Record<string, unknown>> {
  const attrs = node.attrs ?? {};
  let materialized: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (isBlockNodeArray(value)) {
      materialized ??= { ...attrs };
      const children = value;
      materialized[key] = function SlotComponent() {
        const rendered = renderNodes(children, env, childContext);
        if (!env.editing) return rendered;
        // Tag the slot so the canvas can resolve a nested drop to it. The
        // wrapper is display:contents — zero layout impact, the children flow
        // as if it weren't there. Parent id + slot key are separate attrs (not
        // one delimited string) so an id never needs charset-escaping. An empty
        // slot gets a min-height placeholder so it stays a measurable target.
        return createElement(
          "div",
          {
            "data-plumix-slot-parent": node.id,
            "data-plumix-slot-key": key,
            style: { display: "contents" },
          },
          children.length > 0
            ? rendered
            : createElement("div", {
                "data-plumix-slot-empty": "",
                style: { minHeight: "2rem" },
              }),
        );
      };
    }
  }
  return materialized ?? attrs;
}

interface WalkerEnv {
  readonly registry: BlockRegistry;
  readonly devState: DevWarnState;
  readonly tokens: ThemeTokens | undefined;
  readonly breakpoints: ThemeBreakpoints | undefined;
  readonly hooks: BlockRenderHooks | undefined;
  readonly loaderData: ResolvedBlockLoaders | undefined;
  readonly patterns: PatternRegistry | undefined;
  readonly editing: boolean;
}

function renderNodes(
  nodes: readonly BlockNode[],
  env: WalkerEnv,
  context: BlockContext,
): ReactNode {
  return nodes.map((node) => {
    env.hooks?.beforeRender?.(node, context);
    const result = renderNode(node, env, context);
    env.hooks?.afterRender?.(node, context);
    return result;
  });
}

function renderNode(
  node: BlockNode,
  env: WalkerEnv,
  context: BlockContext,
): ReactNode {
  const { registry, devState, tokens, loaderData } = env;
  if (node.name === PATTERN_REF_BLOCK) {
    return renderPatternRef(node, env, context);
  }
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
  const attrs = materializeSlots(node, env, childContext);
  const data = loaderData?.get(node.id);
  let rendered: ReactNode;
  if (data && data.error !== null) {
    // Same shape as the unknown-block path: emit nothing when the block
    // didn't declare a fallback. Observability flows through the
    // `blocks:loader:error` hook, not a console warn here.
    if (!spec.errorFallback) return createElement(Fragment, { key: node.id });
    rendered = spec.errorFallback({ attrs, error: data.error });
  } else {
    const loaders = data?.loaders ?? EMPTY_LOADERS;
    rendered = createElement(spec.render, { attrs, context, loaders });
  }
  if (spec.inline) {
    return createElement(Fragment, { key: node.id }, rendered);
  }
  const safeId = SAFE_ID_RE.test(node.id) ? node.id : null;
  const styleCss =
    safeId && node.style && tokens
      ? emitBlockStyleCss(
          `plumix-block-${safeId}`,
          node.style,
          tokens,
          env.breakpoints,
        )
      : "";
  const className = safeId && styleCss ? `plumix-block-${safeId}` : undefined;
  const styleTag = styleCss
    ? createElement("style", { key: "style" }, styleCss)
    : null;

  return createElement(
    "div",
    {
      key: node.id,
      "data-plumix-block": node.name,
      "data-plumix-id": env.editing && safeId ? safeId : undefined,
      className,
    },
    styleTag,
    rendered,
  );
}

const EMPTY_LOADERS: Readonly<Record<string, unknown>> = Object.freeze({});

function renderPatternRef(
  node: BlockNode,
  env: WalkerEnv,
  context: BlockContext,
): ReactNode {
  const slug = typeof node.attrs?.slug === "string" ? node.attrs.slug : "";
  const resolved = env.patterns?.get(slug);
  if (resolved) {
    return createElement(
      Fragment,
      { key: node.id },
      renderNodes(resolved.content, env, context),
    );
  }
  return createElement(
    Fragment,
    { key: node.id },
    renderUnresolvedPatternRef(slug, env.devState),
  );
}

function renderUnresolvedPatternRef(
  slug: string,
  devState: DevWarnState,
): ReactNode {
  const key = `pattern-ref:${slug}`;
  if (!devState.seen.has(key)) {
    devState.seen.add(key);
    console.warn(`[plumix:blocks] Unresolved pattern reference: ${slug}`);
  }
  if (!isDevMode()) return null;
  return createElement("template", {
    "data-plumix-unresolved-pattern-ref": slug,
  });
}

export function renderBlockTree(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
  options?: RenderBlockTreeOptions,
): ReactNode {
  const env: WalkerEnv = {
    registry,
    devState: devWarnState(registry),
    tokens: options?.tokens,
    breakpoints: options?.breakpoints,
    hooks: options?.hooks,
    loaderData: options?.loaderData,
    patterns: options?.patterns,
    editing: options?.editing ?? false,
  };
  const rootContext: BlockContext = {
    ...DEFAULT_BLOCK_CONTEXT,
    entry: options?.entry ?? DEFAULT_BLOCK_CONTEXT.entry,
    locale: options?.locale ?? DEFAULT_BLOCK_CONTEXT.locale,
    shortcodes: options?.shortcodes ?? null,
  };
  return renderNodes(nodes, env, rootContext);
}
