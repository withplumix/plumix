import type { Node as TiptapNodeFactory } from "@tiptap/core";
import type { ComponentType, ReactNode } from "react";

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
  readonly schema: LazyRef<ReturnType<typeof TiptapNodeFactory.create>>;
  readonly component: LazyRef<BlockComponent<Attrs>>;
  readonly editor?: LazyRef<ComponentType<unknown>>;
  readonly client?: LazyRef<unknown>;
  /**
   * Tiptap-node names this block accepts as input from legacy content.
   * The walker maps these aliases back to the canonical spec `name` when
   * resolving a stored node. Used to migrate StarterKit-shaped content
   * (`type: "paragraph"`) into the namespaced registry (`core/paragraph`)
   * without rewriting the database.
   */
  readonly legacyAliases?: readonly string[];
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
> extends Omit<BlockSpec<Attrs>, "component"> {
  readonly component: BlockComponent<Attrs>;
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
