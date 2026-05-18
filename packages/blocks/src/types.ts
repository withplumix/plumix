import type { Node as TiptapNodeFactory } from "@tiptap/core";
import type { ComponentType, ReactNode } from "react";

import type { BlockSupports } from "./styles/types.js";

/**
 * The persisted ProseMirror JSON shape Tiptap produces.
 *
 * Walker reads `type` to dispatch into the registry, `attrs` to feed the
 * resolved component, and `content` to recurse. `marks` only appears on
 * text leaves. Loose typing on `attrs` is deliberate — each block's
 * Component supplies its own typed `Attrs`.
 */
export interface TiptapNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly TiptapNode[];
  readonly text?: string;
  readonly marks?: readonly TiptapMark[];
}

export interface TiptapMark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/**
 * Threaded through `<EntryContent>` recursion. Block Components introspect
 * it for placement-aware rendering — a media/image inside a core/columns
 * inside a single-post template knows its full ancestry without prop drilling.
 */
export interface BlockContext {
  readonly entry: Readonly<Record<string, unknown>> | null;
  readonly siteSettings: Readonly<Record<string, unknown>>;
  readonly theme: { readonly id: string } | null;
  /** Type name of the immediate parent block, or `null` at the document root. */
  readonly parent: string | null;
  /** 0 at root, incremented for each container traversal. */
  readonly depth: number;
}

/**
 * Props every block Component receives. `children` is the framework's
 * pre-rendered subtree (95% path); `node` exposes the raw subtree for
 * the rare slot-based composition case.
 */
export interface BlockProps<Attrs = Readonly<Record<string, unknown>>> {
  readonly attrs: Attrs;
  readonly children: ReactNode;
  readonly node: TiptapNode;
  readonly context: BlockContext;
}

export type BlockComponent<Attrs = Readonly<Record<string, unknown>>> =
  ComponentType<BlockProps<Attrs>>;

/**
 * A single attribute on a block. `type` resolves through the existing
 * registerFieldType registry; the field-type-specific extras (`options`,
 * `min`, `max`, etc.) flow through unchanged.
 */
export interface BlockAttributeSchema {
  readonly type: string;
  readonly label?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly optional?: boolean;
  readonly [extra: string]: unknown;
}

/**
 * Lazy reference used for cross-bundle code: workers runtime never
 * evaluates admin-only modules and admin never evaluates runtime-only
 * renderers. `buildApp` awaits the side-appropriate refs once at boot.
 */
export type LazyRef<T> = () => Promise<{ default: T } | T>;

/**
 * Templated child for a variation's `innerBlocks`. Inserted verbatim
 * as a Tiptap node with the named block type and the supplied attrs
 * — recursively, so nested templates compose.
 */
export interface BlockVariationInnerBlock {
  readonly name: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly innerBlocks?: readonly BlockVariationInnerBlock[];
}

/**
 * Preset insertion entry. The slash menu shows one item per variation
 * alongside the block itself; selecting an item creates a node of the
 * parent block's type with the variation's `attributes` preset and
 * the `innerBlocks` template materialised under it.
 */
export interface BlockVariation {
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly icon?: string;
  readonly keywords?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly innerBlocks?: readonly BlockVariationInnerBlock[];
}

/**
 * Declarative client-island descriptor. `src` is the public module
 * specifier the bootstrap script imports at hydration time. `export`
 * names the init function within that module (default `"default"`).
 * The init function is invoked once per placeholder element with the
 * placeholder DOM node and parsed attrs.
 */
export interface ClientIslandRef {
  readonly src: string;
  readonly export?: string;
}

/**
 * The unresolved spec returned by `defineBlock`.
 *
 * Editor and Component are lazy refs so the workers bundle can tree-shake
 * admin-only imports (MediaPicker, react-dropzone, etc.) and the admin
 * bundle can tree-shake runtime-only renderers. The registry resolves
 * them once at boot.
 */
export interface BlockSpec<Attrs = Readonly<Record<string, unknown>>> {
  readonly name: string;
  readonly title: string;
  readonly icon?: string;
  readonly category?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly attributes?: Readonly<Record<string, BlockAttributeSchema>>;
  /**
   * Declarative opt-in for the supports axes (color, spacing,
   * typography, border, align, anchor, customClassName) the Inspector
   * should expose and `resolveBlockStyles` should fold into the
   * rendered output. Axes the spec doesn't opt into are silently
   * ignored at render time even if the persisted `attrs.style.*` slot
   * carries values for them.
   */
  readonly supports?: BlockSupports;
  /**
   * Whether the slash menu / Inserter should surface this block as a
   * standalone insertable. `false` for content-only children (table
   * rows, table cells, column children) that the user inserts through
   * a parent's variation template, not directly. Default `true`.
   */
  readonly inserter?: boolean;
  /**
   * Preset insertion entries for the slash menu / Inserter. Each
   * variation surfaces as a separate slash-menu item using this
   * block's schema but with the variation's `attributes` preset and
   * the variation's optional `innerBlocks` template materialised as
   * the inserted children. Used for layouts (Row / Stack on group;
   * 50/50 / 33/67 / 25/50/25 on columns) so authors don't have to
   * configure attributes after every insert.
   */
  readonly variations?: readonly BlockVariation[];
  /**
   * Default inner blocks the slash menu materialises when the author
   * picks the bare block (not a variation). Required for wrapper blocks
   * whose Tiptap schema has a non-optional content expression — e.g.
   * `core/list` requires `coreListItem+`, so inserting a bare empty list
   * silently degrades to a paragraph. Variations override this by
   * supplying their own `innerBlocks`.
   */
  readonly defaultInnerBlocks?: readonly BlockVariationInnerBlock[];
  readonly schema: LazyRef<ReturnType<typeof TiptapNodeFactory.create>>;
  readonly component: LazyRef<BlockComponent<Attrs>>;
  readonly editor?: LazyRef<ComponentType<unknown>>;
  /**
   * Export name on the plugin's `adminEntry` module that resolves to the
   * Tiptap `Node.create(...)` instance for this block. Set by plugin
   * authors so the admin chunk synthesizer can wire the schema into the
   * editor without the admin awaiting a runtime `LazyRef` that points at
   * the plugin's worker-side module. Core blocks leave this unset — the
   * admin imports `@plumix/blocks` directly.
   */
  readonly adminSchema?: string;
  /**
   * Export name on the plugin's `adminEntry` module that resolves to the
   * NodeView Component for this block. Optional; blocks without a bespoke
   * Editor render through Tiptap's default contenteditable surface.
   */
  readonly adminEditor?: string;
  /**
   * Marks this block as a client island. SSR emits a wrapper carrying
   * `data-plumix-island="<spec.name>"` plus a serialised attrs blob; the
   * island-bootstrap script (`<PlumixIslandBootstrap>`) imports `src`
   * once per unique island name and invokes the named export
   * (default `"default"`), passing the placeholder element.
   *
   * `src` must be a browser-resolvable module specifier the SSR shell
   * can stringify into `<script type="module">`. Authors typically pass
   * the URL their build pipeline produces (e.g. via `new URL(...,
   * import.meta.url)` rewriting). Closures (`() => import("…")`) hide
   * the URL from SSR and are deliberately rejected.
   */
  readonly client?: ClientIslandRef;
  /**
   * Tiptap-node names this block accepts as input from legacy content.
   * The walker maps these aliases back to the canonical spec `name` when
   * resolving a stored node. Used to migrate StarterKit-shaped content
   * (`type: "paragraph"`) into the namespaced registry (`core/paragraph`)
   * without rewriting the database.
   */
  readonly legacyAliases?: readonly string[];
  /**
   * Tiptap modifier expressions (e.g. `"Mod-Alt-2"`). Each entry binds
   * a key to "convert current block to this type", optionally with
   * specific attrs. Heading declares six entries (one per level);
   * simpler blocks usually have one. Validated against the same
   * syntax `defineMark`'s keyboardShortcut uses.
   */
  readonly keyboardShortcuts?: readonly BlockKeyboardShortcut[];
  /**
   * Markdown-style input rules that trigger conversion to this block.
   * Each entry's `pattern` matches at the start of a text block
   * (e.g. `"# "` for heading-1). Attrs are merged into the resulting
   * node. Wired into Tiptap's `addInputRules`.
   */
  readonly markdownShortcuts?: readonly BlockMarkdownShortcut[];
  /**
   * Paste rules: HTML selectors this block absorbs when the editor
   * receives pasted content. `fromHTML` can map attributes from the
   * matched DOM element to the block's `attrs`. When omitted, no
   * attrs are extracted.
   */
  readonly parsePaste?: readonly ParsePasteRule[];
  /**
   * Declarative block transforms. Surfaces in the BlockMenu's
   * "Transform to…" submenu via `resolveTransformTargets`.
   */
  readonly transforms?: BlockTransforms;
}

/**
 * How the keyboard / markdown shortcut converts the current selection
 * into this block:
 *
 * - `"setNode"` (default): replaces the current textblock's type
 *   (heading, quote, code — anything that holds inline content).
 * - `"wrap"`: wraps the current textblock in a list-style container
 *   (`core/list`, `core/list-ordered`) — uses Tiptap's wrapInList /
 *   wrappingInputRule under the hood.
 * - `"leaf"`: inserts a leaf node that doesn't hold a textblock
 *   (`core/separator`, `core/spacer`) — uses Tiptap's nodeInputRule
 *   for markdown triggers.
 */
export type BlockShortcutMode = "setNode" | "wrap" | "leaf";

export interface BlockKeyboardShortcut {
  readonly shortcut: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly mode?: BlockShortcutMode;
}

export interface BlockMarkdownShortcut {
  readonly pattern: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly mode?: BlockShortcutMode;
}

/**
 * Declarative transforms between blocks. The BlockMenu's "Transform
 * to…" submenu reads each registered block's `transforms.to` plus the
 * symmetric entries from every other block whose `transforms.from`
 * names the current block — both sides build the same target list
 * regardless of which side declared it.
 *
 * `priority` orders the resulting entries when the same target name
 * surfaces twice (e.g. core/paragraph → core/heading vs core/heading
 * → core/paragraph from the other side); higher priority wins.
 */
export interface BlockTransformTo {
  readonly target: string;
  readonly mapAttrs?: (
    currentAttrs: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
  /**
   * Dispatch mode for the transform — same discriminator as
   * `BlockShortcutMode`. `setNode` (default) for textblock-to-textblock,
   * `wrap` for list-style containers, `leaf` for atom inserts.
   */
  readonly mode?: BlockShortcutMode;
}

export interface BlockTransformFrom {
  readonly source: string;
  readonly mapAttrs?: (
    sourceAttrs: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
  readonly mode?: BlockShortcutMode;
}

export interface BlockTransforms {
  readonly priority?: number;
  readonly to?: readonly BlockTransformTo[];
  readonly from?: readonly BlockTransformFrom[];
}

export interface ParsePasteRule {
  readonly selector: string;
  readonly fromHTML?: (
    element: HTMLElement,
  ) => Readonly<Record<string, unknown>> | undefined;
  readonly priority?: number;
}

/**
 * The post-merge view of a `BlockSpec`.
 *
 * `component` is awaited during registry merge and replaced with the
 * resolved (sync) component — theme override if present, otherwise the
 * spec's default. This keeps the SSR walker synchronous; React's
 * `renderToReadableStream` can't await arbitrary promises during render.
 *
 * `editor` and `client` remain lazy refs: they're only evaluated in the
 * admin bundle and the browser respectively, so the runtime bundle never
 * needs to await them.
 */
export interface ResolvedBlockSpec<
  Attrs = Readonly<Record<string, unknown>>,
> extends Omit<BlockSpec<Attrs>, "component" | "schema"> {
  readonly component: BlockComponent<Attrs>;
  /**
   * The awaited Tiptap Node instance. Stored sync (not lazy) so the
   * admin editor can build its extension list synchronously without
   * a second round of awaits, and so that any caller that already
   * has the registry doesn't have to await again to inspect it.
   */
  readonly schema: ReturnType<typeof TiptapNodeFactory.create>;
  readonly registeredBy: string | null;
}

/**
 * Immutable lookup map produced by the registry merge. Read-only at
 * runtime; the only entry points are `get(name)` and iteration.
 */
export interface BlockRegistry {
  /**
   * Resolve a block spec by canonical name OR registered legacy alias.
   * Returns undefined when neither matches.
   */
  get(name: string): ResolvedBlockSpec | undefined;
  has(name: string): boolean;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[string, ResolvedBlockSpec]>;
}
