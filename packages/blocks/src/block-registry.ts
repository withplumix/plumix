import type { ComponentType } from "react";

import type { BlockNodeComponent } from "./render-block-tree.js";

export interface BlockInputOption {
  readonly label: string;
  readonly value: string | number | boolean;
}

export interface BlockInput {
  readonly name: string;
  readonly type: string;
  readonly label?: string;
  readonly options?: readonly BlockInputOption[];
}

/**
 * Hydration strategy declared by a block's `client` descriptor. Only
 * `load` is wired in the islands MVP; the remaining values are exported
 * up front so block-author code targeting the full strategy set
 * compiles today even though `idle`/`visible`/`interaction`/`only` land
 * in a follow-up slice.
 */
export type HydrateWhen = "load" | "idle" | "visible" | "interaction" | "only";

/**
 * Prefetch strategy for the island's JS chunk. Like `HydrateWhen`,
 * declared as a full union for compile-time stability; only `load`
 * acts today.
 */
export type PrefetchWhen = "load" | "idle" | "visible";

export interface ClientIslandDescriptor {
  readonly component: ComponentType<Readonly<Record<string, unknown>>>;
  readonly hydrateWhen?: HydrateWhen;
  readonly prefetchWhen?: PrefetchWhen;
}

export interface BlockVariation {
  readonly slug: string;
  readonly title: string;
  readonly icon?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/**
 * Dispatch hint shared between keyboard shortcuts, markdown shortcuts,
 * and block transforms. `setNode` (default) for textblock-to-textblock
 * conversions, `wrap` for list-style containers, `leaf` for atom inserts.
 */
export type BlockShortcutMode = "setNode" | "wrap" | "leaf";

export interface BlockTransformTo {
  readonly target: string;
  readonly mapAttrs?: (
    currentAttrs: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>>;
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

export interface BlockSpec<
  Attrs extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
> {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly icon?: string;
  readonly category?: string;
  readonly inserter?: boolean;
  readonly inputs?: readonly BlockInput[];
  readonly render: BlockNodeComponent<Attrs>;
  readonly inline?: boolean;
  readonly defaults?: Readonly<Partial<Attrs>>;
  readonly placeholder?: string;
  readonly capability?: string;
  readonly client?: ClientIslandDescriptor;
  readonly transforms?: BlockTransforms;
  readonly variations?: readonly BlockVariation[];
}

export interface BlockRegistry {
  get(name: string): BlockSpec | undefined;
  has(name: string): boolean;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<BlockSpec>;
}

export function createBlockRegistry(
  specs: readonly BlockSpec[] = [],
): BlockRegistry {
  const map = new Map<string, BlockSpec>();
  for (const spec of specs) {
    map.set(spec.name, spec);
  }
  return Object.freeze({
    get: (name: string) => map.get(name),
    has: (name: string) => map.has(name),
    get size() {
      return map.size;
    },
    [Symbol.iterator]: () => map.values(),
  });
}

export function defineBlock(spec: BlockSpec): BlockSpec {
  return Object.freeze(spec);
}
