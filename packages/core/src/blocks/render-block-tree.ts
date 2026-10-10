import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

import type { JsonObject } from "../json.js";
import type { BlockRegistry } from "./block-registry.js";
import type { HydratedEntry, SiteSettings } from "./context-bags.js";
import type { RootTag } from "./html/root-tag.js";
import type { CompiledCatalog, MessageValues } from "./i18n-label.js";
import type {
  BlockLoaderRecord,
  ResolvedBlockLoaders,
  ResolvedLoaders,
} from "./loaders.js";
import type { ShortcodeRegistry } from "./shortcodes/types.js";
import type {
  ResponsiveStyleSlot,
  ThemeBreakpoints,
  VisibilityFlags,
} from "./styles/style-emitter.js";
import { blockSlotKeys } from "./block-slots.js";
import { editAppender } from "./edit-appender.js";
import { safeHtmlAttrs } from "./html/attrs.js";
import { resolveRootTag } from "./html/root-tag.js";
import { resolveMessage } from "./i18n-label.js";
import { emitBlockStyleCss } from "./styles/style-emitter.js";

/**
 * Threaded through `renderBlockTree` recursion. Block components introspect
 * it for placement-aware rendering — a block knows its full ancestry chain
 * without prop drilling.
 */
export interface BlockContext {
  readonly entry: HydratedEntry | null;
  readonly siteSettings: SiteSettings;
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
  /** With no catalog wired, returns the descriptor's English source. */
  readonly t: (descriptor: MessageDescriptor, values?: MessageValues) => string;
}

/**
 * A type alias, not an `interface`: slot attrs hold children, so the whole node
 * must be readable as a {@link JsonValue}.
 */
export type BlockNode = Readonly<{
  id: string;
  name: string;
  attrs?: JsonObject;
  style?: ResponsiveStyleSlot;
  /** Per-device visibility, decoupled from `style` so hiding a block never
   *  overwrites a bucket's layout `display`. Emitted as `display: none`. */
  hidden?: VisibilityFlags;
  /** Author-supplied HTML attributes spread onto the block's root element.
   *  Filtered through {@link safeHtmlAttrs} at render — only allowlisted, inert
   *  keys (id, title, role, aria-, data- prefixes) survive. Not responsive. */
  htmlAttrs?: Readonly<Record<string, string>>;
  /** Author-given instance name shown in the Layers tree; falls back to the
   *  block type's title when absent. Editor-only metadata, ignored at render. */
  label?: string;
  /** Overrides the block's root element (Builder's tag-name). Applied to the
   *  default wrapper and threaded to `selfSeam` container blocks via render
   *  props; constrained to {@link resolveRootTag}'s allowlist, else ignored. */
  tagName?: string;
  /** Author-supplied CSS class names (space-separated) merged onto the block's
   *  root, alongside the generated style class. An inert escape hatch — class
   *  tokens can't execute; React escapes the attribute. */
  className?: string;
}>;

/**
 * Not JSON: every slot key holds the component that renders that slot's
 * children.
 */
export type MaterializedAttrs = Readonly<Record<string, unknown>>;

/**
 * Not post-order: slot children render lazily inside React, so a parent's
 * `afterRender` fires before its children's `beforeRender`.
 */
export interface BlockRenderHooks {
  readonly beforeRender?: (node: BlockNode, context: BlockContext) => void;
  readonly afterRender?: (node: BlockNode, context: BlockContext) => void;
}

/**
 * `beforeRender` sees the block's output before the seam wrapper is applied;
 * `afterRender` sees the fully wrapped element.
 */
export interface BlockRenderFilters {
  readonly beforeRender?: (
    element: ReactNode,
    node: BlockNode,
    context: BlockContext,
  ) => ReactNode;
  readonly afterRender?: (
    element: ReactNode,
    node: BlockNode,
    context: BlockContext,
  ) => ReactNode;
}

export interface RenderBlockTreeOptions {
  /**
   * Theme breakpoints driving the emitter's @media maxima (default 991/640).
   */
  readonly breakpoints?: ThemeBreakpoints;
  readonly hooks?: BlockRenderHooks;
  readonly renderFilters?: BlockRenderFilters;
  readonly loaderData?: ResolvedBlockLoaders;
  /** Render locale for shortcode/`Intl` localization. Defaults to `"en"`. */
  readonly locale?: string;
  /** Registered shortcodes for authored-content body expansion. */
  readonly shortcodes?: ShortcodeRegistry;
  /** Queried entry, exposed to shortcodes via `BlockContext.entry`. */
  readonly entry?: HydratedEntry | null;
  /**
   * The site's `site` settings group, exposed via `BlockContext.siteSettings`.
   */
  readonly siteSettings?: SiteSettings;
  /**
   * Edit mode: tag each block wrapper with `data-plumix-id` for canvas
   * selection.
   */
  readonly editing?: boolean;
  /** The compiled catalog for `locale`, which `BlockContext.t` reads. Absent,
   *  every descriptor resolves to its English source. */
  readonly catalog?: CompiledCatalog;
}

// Both `data-plumix-*` markers are edit-only; the public page ships neither.
interface BlockSeamProps {
  readonly "data-plumix-block"?: string;
  readonly "data-plumix-id"?: string;
  readonly className?: string;
}

// Seam props plus author HTML attributes. The seam keys are spread last when
// built, so they always win a key collision.
type BlockProps = Readonly<Record<string, string | undefined>> & BlockSeamProps;

export interface BlockNodeRenderProps<
  Attrs = MaterializedAttrs,
  Loaders extends BlockLoaderRecord = BlockLoaderRecord,
> {
  readonly attrs: Attrs;
  readonly context: BlockContext;
  readonly loaders: ResolvedLoaders<Loaders>;
  /**
   * Seam attributes for `selfSeam` blocks to spread onto their root element.
   */
  readonly blockProps: BlockProps;
  /** The author's allowlisted root-element override, or `undefined`. A
   *  `selfSeam` container block should render `tagName ?? <its default>`. */
  readonly tagName?: RootTag;
  /** The node's render-safe id (absent for an unsafe id), for a block that emits
   *  its own per-instance scoped CSS (e.g. `.plumix-<x>-${nodeId}` in a `<style>`). */
  readonly nodeId?: string;
  /**
   * Active theme breakpoints, for a block emitting its own responsive
   * `<style>`.
   */
  readonly breakpoints?: ThemeBreakpoints;
}

export type BlockNodeComponent<
  Attrs = MaterializedAttrs,
  Loaders extends BlockLoaderRecord = BlockLoaderRecord,
> = (props: BlockNodeRenderProps<Attrs, Loaders>) => ReactNode;

/** A `BlockContext.t` over `catalog`. */
export function createMessageResolver(
  catalog: CompiledCatalog,
): BlockContext["t"] {
  return (descriptor, values) => resolveMessage(catalog, descriptor, values);
}

const ENGLISH_ONLY = createMessageResolver({});

export const DEFAULT_BLOCK_CONTEXT: BlockContext = Object.freeze({
  entry: null,
  siteSettings: Object.freeze({}),
  parent: null,
  depth: 0,
  locale: "en",
  shortcodes: null,
  editing: false,
  t: ENGLISH_ONLY,
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

/**
 * Not a slot test: `[]` and a data array of `{ id, name }` objects pass too.
 * A node's slots come from {@link blockSlotKeys}.
 */
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
): MaterializedAttrs {
  const attrs = node.attrs ?? {};
  const spec = env.registry.get(node.name);
  const inputs = spec?.inputs;

  // An unset slot is materialized too, so edit mode still renders its "Add a
  // block" affordance.
  const slotKeys = blockSlotKeys(node, spec);
  if (slotKeys.length === 0) return attrs;

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
      // Tagged so the canvas resolves nested drops. Separate attrs so an id
      // never needs escaping; an empty slot keeps a measurable height.
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
              editAppender(childContext.t, {
                parentId: node.id,
                slotKey: key,
              }),
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
  readonly renderFilters: BlockRenderFilters | undefined;
  readonly loaderData: ResolvedBlockLoaders | undefined;
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

interface BlockPresentation {
  readonly safeId: string | null;
  readonly blockProps: BlockProps;
  readonly styleTag: ReactNode;
}

function resolveBlockPresentation(
  node: BlockNode,
  env: WalkerEnv,
): BlockPresentation {
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
  return { safeId, blockProps, styleTag };
}

function renderNode(
  node: BlockNode,
  env: WalkerEnv,
  context: BlockContext,
): ReactNode {
  const { registry, devState, loaderData } = env;
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

  const { safeId, blockProps, styleTag } = resolveBlockPresentation(node, env);
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
      nodeId: safeId ?? undefined,
      breakpoints: env.breakpoints,
    });
  }
  if (env.renderFilters?.beforeRender) {
    rendered = env.renderFilters.beforeRender(rendered, node, context);
  }

  // selfSeam skips the wrapper div, which `<td>`/`<tr>` can't have and which
  // would make a style class merely inherit.
  let final: ReactNode;
  if (spec.selfSeam) {
    final = createElement(Fragment, { key: node.id }, styleTag, rendered);
  } else if (spec.inline) {
    // Legacy: superseded by selfSeam.
    final = createElement(Fragment, { key: node.id }, rendered);
  } else {
    final = createElement(
      tagName ?? "div",
      { key: node.id, ...blockProps },
      styleTag,
      rendered,
    );
  }
  if (env.renderFilters?.afterRender) {
    final = env.renderFilters.afterRender(final, node, context);
  }
  return final;
}

const EMPTY_LOADERS: Readonly<Record<string, unknown>> = Object.freeze({});

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
    renderFilters: options?.renderFilters,
    loaderData: options?.loaderData,
    editing: options?.editing ?? false,
  };
  const rootContext: BlockContext = {
    ...DEFAULT_BLOCK_CONTEXT,
    entry: options?.entry ?? DEFAULT_BLOCK_CONTEXT.entry,
    siteSettings: options?.siteSettings ?? DEFAULT_BLOCK_CONTEXT.siteSettings,
    locale: options?.locale ?? DEFAULT_BLOCK_CONTEXT.locale,
    shortcodes: options?.shortcodes ?? null,
    editing: options?.editing ?? false,
    t: options?.catalog
      ? createMessageResolver(options.catalog)
      : DEFAULT_BLOCK_CONTEXT.t,
  };
  return renderNodes(nodes, env, rootContext);
}
