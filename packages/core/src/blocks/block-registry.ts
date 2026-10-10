import type { ReactNode } from "react";

import type { Label } from "../i18n/label.js";
import type { JsonObject } from "../json.js";
import type { BlockLoaderRecord } from "./loaders.js";
import type {
  BlockNode,
  BlockNodeComponent,
  MaterializedAttrs,
} from "./render-block-tree.js";
import type { ResponsiveStyleSlot } from "./styles/style-emitter.js";

export interface BlockInputOption {
  readonly label: Label;
  readonly value: string | number | boolean;
}

export interface BlockInput {
  readonly name: string;
  readonly type: string;
  readonly label?: Label;
  /** Placeholder shown when the control has no value — e.g. the effective
   *  default a `select`/`combobox` falls back to, so its trigger isn't blank. */
  readonly placeholder?: Label;
  readonly options?: readonly BlockInputOption[];
  /**
   * Slot inputs only. Omitted means any block. Enforced at write-time
   * validation.
   */
  readonly allowedBlocks?: readonly string[];
  /**
   * Slot inputs only: drops the editor's drop-target wrapper where a `<div>`
   * would be invalid HTML, at the cost of nested-drop targeting.
   */
  readonly rawSlot?: boolean;
  /**
   * Slot inputs only. Inserted as a deep-cloned, id-rewritten tree; an
   * explicit slot value wins.
   */
  readonly defaultChildren?: readonly BlockNode[];
  /**
   * Binds the input to a CSS property in `node.style` instead of an attr, so
   * the control stays in sync with the Styles tab.
   */
  readonly styleProperty?: string;
  /**
   * Plugin reference inputs only. Opaque to core; the host forwards it to the
   * plugin field.
   */
  readonly accept?: string | readonly string[];
}

/**
 * An input whose stored value carries text worth reading back out of the
 * content — the unit of a block's text declaration.
 */
export interface BlockTextInput {
  /** The input's `name`, as declared in the block's `inputs`. */
  readonly name: string;
  /** The value is an HTML fragment: tags are stripped and entities decoded. */
  readonly html?: boolean;
  /**
   * Counts toward reading length. Set `false` for text that is findable but not
   * read at prose speed, like code, alt text or a caption.
   */
  readonly prose?: boolean;
}

export type BlockVariationScope = "inserter" | "block" | "transform";

export interface BlockVariationExample {
  readonly attrs?: JsonObject;
  readonly innerBlocks?: readonly BlockNode[];
}

export type BlockVariationIsActive =
  | readonly string[]
  | ((blockAttrs: JsonObject, variationAttrs: JsonObject) => boolean);

export interface BlockVariation {
  readonly slug: string;
  readonly title: Label;
  readonly icon?: string;
  readonly description?: Label;
  readonly keywords?: readonly Label[];
  readonly attrs?: JsonObject;
  // Validated against the block registry at commit time, so bad names or
  // attrs fail at boot.
  readonly innerBlocks?: readonly BlockNode[];
  // An empty array hides the variation everywhere, keeping it only as a
  // readback identity for `isActive`.
  readonly scope?: readonly BlockVariationScope[];
  // Preview surfaces render this instead of the runtime values, e.g. when the
  // runtime body relies on an async loader.
  readonly example?: BlockVariationExample;
  // `string[]` matchers: longest list wins among ties, then registration
  // order. Function matchers: first true wins.
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
  readonly mapAttrs?: (currentAttrs: JsonObject) => JsonObject;
  readonly mode?: BlockShortcutMode;
}

export interface BlockTransformFrom {
  readonly source: string;
  readonly mapAttrs?: (sourceAttrs: JsonObject) => JsonObject;
  readonly mode?: BlockShortcutMode;
}

export interface BlockTransforms {
  readonly priority?: number;
  readonly to?: readonly BlockTransformTo[];
  readonly from?: readonly BlockTransformFrom[];
}

export interface BlockSpec<
  Attrs extends MaterializedAttrs = MaterializedAttrs,
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
  /**
   * Data rather than a function so the merged roster hashes to an extractor
   * version, with no version integer for an author to keep true.
   */
  readonly text?: readonly BlockTextInput[];
  readonly render: BlockNodeComponent<Attrs, Loaders>;
  readonly loaders?: Loaders;
  // Renders in place of `render` when a loader rejects. Without one,
  // the walker emits nothing (same shape as the unknown-block path).
  readonly errorFallback?: (args: {
    readonly attrs: Attrs;
    readonly error: unknown;
  }) => ReactNode;
  readonly inline?: boolean;
  // For elements a div can't wrap (`<td>`, `<tr>`) and to beat the theme's
  // element styles. Must spread `blockProps` onto a single host element; a
  // Fragment or string drops the seam.
  readonly selfSeam?: boolean;
  // `NoInfer` keeps `defaults` from narrowing `Attrs` inference. `JsonObject`
  // because defaults are merged into a new node's stored attrs, which the
  // materialized `Attrs` need not be.
  readonly defaults?: Readonly<Partial<NoInfer<Attrs>>> & JsonObject;
  /**
   * Seeded into a new block's `style` slot so they show as editable values,
   * not hidden CSS. Use `var(--plumix-…, fallback)` so a theme can override.
   */
  readonly defaultStyles?: ResponsiveStyleSlot;
  readonly placeholder?: string;
  readonly capability?: string;
  readonly transforms?: BlockTransforms;
  readonly variations?: readonly BlockVariation[];
  /**
   * When set, the block can only be inserted into a matching parent's slot,
   * never at the top level.
   */
  readonly requiresParent?: readonly string[];
  /**
   * Unset means every type. Scopes only the editor's palette; stored content
   * still renders on any entry type.
   */
  readonly entryTypes?: readonly string[];
}

/** The namespace reserved for the built-in specs in `blocks/`. */
export const CORE_BLOCK_NAMESPACE = "core/";

/** Whether `name` sits in the reserved `core/` namespace. */
export const isReservedBlockName = (name: string): boolean =>
  name.startsWith(CORE_BLOCK_NAMESPACE);

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

// Returns plain `BlockSpec` because the registry stores homogenized rows and
// `BlockSpec` is invariant in both generics. `Attrs` defaults wide so
// `defaults` doesn't narrow it.
export function defineBlock<
  Attrs extends MaterializedAttrs = MaterializedAttrs,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Loaders extends BlockLoaderRecord = {},
>(spec: BlockSpec<Attrs, Loaders>): BlockSpec {
  // Safety: the registry is keyed by name, so a widened spec only meets nodes
  // carrying its own name; the erasure buys a homogeneous map, not
  // interchangeable specs.
  return Object.freeze(spec) as unknown as BlockSpec;
}
