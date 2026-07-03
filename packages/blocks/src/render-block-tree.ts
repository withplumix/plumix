import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { BlockRegistry } from "./block-registry.js";
import type { RootTag } from "./html/root-tag.js";
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
  VisibilityFlags,
} from "./styles/style-emitter.js";
import { editAppender } from "./edit-appender.js";
import { safeHtmlAttrs } from "./html/attrs.js";
import { resolveRootTag } from "./html/root-tag.js";
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
  /** True inside the editor canvas — lets a block render edit-only affordances
   *  (e.g. an empty-state placeholder) that don't ship to the public page. */
  readonly editing: boolean;
}

export interface BlockNode {
  readonly id: string;
  readonly name: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly style?: ResponsiveStyleSlot;
  /** Per-device visibility, decoupled from `style` so hiding a block never
   *  overwrites a bucket's layout `display`. Emitted as `display: none`. */
  readonly hidden?: VisibilityFlags;
  /** Author-supplied HTML attributes spread onto the block's root element.
   *  Filtered through {@link safeHtmlAttrs} at render — only allowlisted, inert
   *  keys (id, title, role, aria-, data- prefixes) survive. Not responsive. */
  readonly htmlAttrs?: Readonly<Record<string, string>>;
  /** Author-given instance name shown in the Layers tree; falls back to the
   *  block type's title when absent. Editor-only metadata, ignored at render. */
  readonly label?: string;
  /** Overrides the block's root element (Builder's tag-name). Applied to the
   *  default wrapper and threaded to `selfSeam` container blocks via render
   *  props; constrained to {@link resolveRootTag}'s allowlist, else ignored. */
  readonly tagName?: string;
  /** Author-supplied CSS class names (space-separated) merged onto the block's
   *  root, alongside the generated style class. An inert escape hatch — class
   *  tokens can't execute; React escapes the attribute. */
  readonly className?: string;
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
  /** Localized "Add a block" label for the edit-mode empty-slot affordance.
   *  The host resolves it (it owns Lingui) and passes it in; the canvas has no
   *  i18n runtime. Defaults to English inside `editAppender` when absent. */
  readonly addBlockLabel?: string;
}

/** The framework seam keys a block spreads onto its root element. Both
 *  `data-plumix-*` markers are edit-only (canvas selection + X-ray); the public
 *  page ships neither. */
interface BlockSeamProps {
  readonly "data-plumix-block"?: string;
  readonly "data-plumix-id"?: string;
  readonly className?: string;
}

// Seam props plus author HTML attributes. The seam keys are spread last when
// built, so they always win a key collision.
type BlockProps = Readonly<Record<string, string | undefined>> & BlockSeamProps;

export interface BlockNodeRenderProps<
  Attrs = Readonly<Record<string, unknown>>,
  Loaders extends BlockLoaderRecord = BlockLoaderRecord,
> {
  readonly attrs: Attrs;
  readonly context: BlockContext;
  readonly loaders: ResolvedLoaders<Loaders>;
  /** Seam attributes for `selfSeam` blocks to spread onto their root element. */
  readonly blockProps: BlockProps;
  /** The author's allowlisted root-element override, or `undefined`. A
   *  `selfSeam` container block should render `tagName ?? <its default>`. */
  readonly tagName?: RootTag;
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
  editing: false,
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
  const inputs = env.registry.get(node.name)?.inputs;

  // Slots to materialize: any attr that already holds a child array, plus —
  // when editing — every declared slot input even if unset, so an empty slot
  // still renders its placeholder + "Add a block" affordance. Outside edit
  // mode an unset slot stays absent, keeping SSR output byte-identical.
  const slotKeys = new Set<string>();
  for (const [key, value] of Object.entries(attrs)) {
    if (isBlockNodeArray(value)) slotKeys.add(key);
  }
  if (env.editing) {
    for (const input of inputs ?? []) {
      if (input.type === "slot" && input.rawSlot !== true)
        slotKeys.add(input.name);
    }
  }
  if (slotKeys.size === 0) return attrs;

  const materialized: Record<string, unknown> = { ...attrs };
  for (const key of slotKeys) {
    const value = attrs[key];
    const children = isBlockNodeArray(value) ? value : [];
    // A raw slot renders children directly — its drop-target wrapper would be
    // invalid HTML in the parent (e.g. a `<div>` inside `<table>`/`<tr>`).
    const rawSlot = inputs?.find((i) => i.name === key)?.rawSlot === true;
    materialized[key] = function SlotComponent() {
      const rendered = renderNodes(children, env, childContext);
      if (!env.editing || rawSlot) return rendered;
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
          : createElement(
              "div",
              {
                "data-plumix-slot-empty": "",
                style: { minHeight: "2rem", padding: "0.5rem" },
              },
              // An empty slot shows the same in-canvas "Add a block"
              // affordance as the root — clicking it inserts into this slot.
              editAppender(
                { parentId: node.id, slotKey: key },
                env.addBlockLabel,
              ),
            ),
      );
    };
  }
  return materialized;
}

interface WalkerEnv {
  readonly registry: BlockRegistry;
  readonly devState: DevWarnState;
  readonly breakpoints: ThemeBreakpoints | undefined;
  readonly hooks: BlockRenderHooks | undefined;
  readonly loaderData: ResolvedBlockLoaders | undefined;
  readonly patterns: PatternRegistry | undefined;
  readonly editing: boolean;
  readonly addBlockLabel: string | undefined;
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
  const { registry, devState, loaderData } = env;
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

  const safeId = SAFE_ID_RE.test(node.id) ? node.id : null;
  const styleCss =
    safeId && (node.style || node.hidden)
      ? emitBlockStyleCss(
          `plumix-block-${safeId}`,
          node.style,
          env.breakpoints,
          node.hidden,
        )
      : "";
  const styleClass = safeId && styleCss ? `plumix-block-${safeId}` : undefined;
  // Author classes ride alongside the generated style class. Order is cosmetic
  // — CSS cascade is source-order in the stylesheet, not attribute order.
  const classes = [node.className?.trim(), styleClass].filter(Boolean);
  const className = classes.length > 0 ? classes.join(" ") : undefined;
  const styleTag = styleCss
    ? createElement("style", { key: "style" }, styleCss)
    : null;
  const blockProps: BlockProps = {
    ...safeHtmlAttrs(node.htmlAttrs),
    "data-plumix-block": env.editing ? node.name : undefined,
    "data-plumix-id": env.editing && safeId ? safeId : undefined,
    className,
  };
  // The author's root-element override, allowlisted. selfSeam container blocks
  // read it via render props; the default wrapper uses it below.
  const tagName = resolveRootTag(node.tagName);

  let rendered: ReactNode;
  if (data && data.error !== null) {
    // Same shape as the unknown-block path: emit nothing when the block
    // didn't declare a fallback. Observability flows through the
    // `blocks:loader:error` hook, not a console warn here.
    if (!spec.errorFallback) return createElement(Fragment, { key: node.id });
    rendered = spec.errorFallback({ attrs, error: data.error });
  } else {
    const loaders = data?.loaders ?? EMPTY_LOADERS;
    rendered = createElement(spec.render, {
      attrs,
      context,
      loaders,
      blockProps,
      tagName,
    });
  }

  // selfSeam: the block spread `blockProps` onto its own root element, so the
  // seam needs no wrapper div (which `<td>`/`<tr>` can't have, and which would
  // make a style class only inherit rather than win). The `<style>` rides as a
  // fragment sibling.
  if (spec.selfSeam) {
    return createElement(Fragment, { key: node.id }, styleTag, rendered);
  }
  // Legacy: superseded by selfSeam.
  if (spec.inline) {
    return createElement(Fragment, { key: node.id }, rendered);
  }
  return createElement(
    tagName ?? "div",
    { key: node.id, ...blockProps },
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
    breakpoints: options?.breakpoints,
    hooks: options?.hooks,
    loaderData: options?.loaderData,
    patterns: options?.patterns,
    editing: options?.editing ?? false,
    addBlockLabel: options?.addBlockLabel,
  };
  const rootContext: BlockContext = {
    ...DEFAULT_BLOCK_CONTEXT,
    entry: options?.entry ?? DEFAULT_BLOCK_CONTEXT.entry,
    locale: options?.locale ?? DEFAULT_BLOCK_CONTEXT.locale,
    shortcodes: options?.shortcodes ?? null,
    editing: options?.editing ?? false,
  };
  return renderNodes(nodes, env, rootContext);
}
