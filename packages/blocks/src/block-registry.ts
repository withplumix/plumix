import type { ReactNode } from "react";

import type { Label } from "./i18n-label.js";
import type { BlockLoaderRecord } from "./loaders.js";
import type { BlockNode, BlockNodeComponent } from "./render-block-tree.js";

export interface BlockInputOption {
  readonly label: Label;
  readonly value: string | number | boolean;
}

export interface BlockInput {
  readonly name: string;
  readonly type: string;
  readonly label?: Label;
  readonly options?: readonly BlockInputOption[];
  /**
   * Slot inputs only: the block names this slot accepts as children.
   * Omitted = any block (general content slots). Enforced at write-time
   * validation and surfaced to the editor so the slot only takes valid
   * children. Mirrors Gutenberg's `allowedBlocks`.
   */
  readonly allowedBlocks?: readonly string[];
  /**
   * Slot inputs only: render children directly, without the editor's
   * `display:contents` drop-target wrapper. Required where that wrapper would be
   * invalid HTML — a `<div>` inside `<table>`/`<tr>` — at the cost of canvas
   * nested-drop targeting for this slot (its children stay individually
   * selectable via their own seam).
   */
  readonly rawSlot?: boolean;
}

export type BlockVariationScope = "inserter" | "block" | "transform";

export interface BlockVariationExample {
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly innerBlocks?: readonly BlockNode[];
}

export type BlockVariationIsActive =
  | readonly string[]
  | ((
      blockAttrs: Readonly<Record<string, unknown>>,
      variationAttrs: Readonly<Record<string, unknown>>,
    ) => boolean);

export interface BlockVariation {
  readonly slug: string;
  readonly title: Label;
  readonly icon?: string;
  readonly description?: Label;
  readonly keywords?: readonly Label[];
  readonly attrs?: Readonly<Record<string, unknown>>;
  // Default body for the parent block's conventional `content` slot.
  // Inserted as a deep-cloned, ID-rewritten tree — source remains
  // unmutated across insertions. Validated against the block registry
  // at commit time so unknown block names / undeclared attrs surface
  // at boot with parent + variation + path traces.
  readonly innerBlocks?: readonly BlockNode[];
  // Surfaces the variation in the inserter (default), via a block-scope
  // picker, or as a transform target. Empty array hides the variation
  // from all surfaces — useful as a readback-only identity for stored
  // instances referenced by `isActive`.
  readonly scope?: readonly BlockVariationScope[];
  // Preview-only override for inserter card / block-scope picker. When
  // set, preview surfaces render `example.attrs` / `example.innerBlocks`
  // instead of the runtime values. Insertion still uses the runtime
  // `attrs` + `innerBlocks` — useful when the runtime body relies on an
  // async loader and the preview needs static content.
  readonly example?: BlockVariationExample;
  // Per-instance identity matcher. `string[]` lists attr names whose
  // values on the block instance must equal the variation's `attrs`
  // value for the same name; among ties the longest list wins, then
  // registration order. Function matchers run first-true wins.
  readonly isActive?: BlockVariationIsActive;
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
  Loaders extends BlockLoaderRecord = BlockLoaderRecord,
> {
  readonly name: string;
  readonly title?: Label;
  readonly description?: Label;
  readonly keywords?: readonly Label[];
  readonly icon?: string;
  readonly category?: string;
  readonly inserter?: boolean;
  readonly inputs?: readonly BlockInput[];
  readonly render: BlockNodeComponent<Attrs, Loaders>;
  readonly loaders?: Loaders;
  // Renders in place of `render` when a loader rejects. Without one,
  // the walker emits nothing (same shape as the unknown-block path).
  readonly errorFallback?: (args: {
    readonly attrs: Attrs;
    readonly error: unknown;
  }) => ReactNode;
  readonly inline?: boolean;
  // The block spreads the render-supplied `blockProps` (`data-plumix-id`,
  // `data-plumix-block`, style `className`) onto its own root element instead
  // of receiving an external wrapper `<div>`. Required for elements a div can't
  // wrap (`<td>`, `<tr>`) and to make a style class beat the theme's element
  // styles (e.g. text color on a heading). The block MUST spread `blockProps`
  // onto a single host element — a Fragment/string return silently drops the
  // seam. A styled table-row block emits its `<style>` inside `<tbody>` (invalid
  // but browser-tolerated); `errorFallback` is not handed `blockProps`.
  readonly selfSeam?: boolean;
  // `NoInfer` keeps `defaults` from driving `Attrs` inference at
  // `defineBlock` — without it, `{ defaults: { text: "" } }` would
  // narrow `Attrs` to `{ text: string }` even when `render` reads other
  // keys. `defaults` checks against the inferred `Attrs`, doesn't bias it.
  readonly defaults?: Readonly<Partial<NoInfer<Attrs>>>;
  readonly placeholder?: string;
  readonly capability?: string;
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

// Strong typing flows through the inline spec literal (so `render`
// sees `loaders` typed from the `loaders` record, and `defaults` is
// checked against `Attrs`). The return type widens to plain `BlockSpec`
// because `BlockRegistry` stores a homogenized row and `BlockSpec` is
// invariant in both generics. Same shape TanStack uses for
// `match.loaderData`. `Attrs` defaults wide so call sites that read
// extra keys from `attrs` aren't accidentally narrowed by `defaults`.
export function defineBlock<
  Attrs extends Readonly<Record<string, unknown>> = Readonly<
    Record<string, unknown>
  >,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Loaders extends BlockLoaderRecord = {},
>(spec: BlockSpec<Attrs, Loaders>): BlockSpec {
  return Object.freeze(spec) as unknown as BlockSpec;
}
