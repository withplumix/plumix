import type { ReactNode } from "react";

import type { Label } from "./i18n-label.js";
import type { JsonObject } from "./json.js";
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
  /**
   * Slot inputs only: the body seeded into this slot when the block is first
   * inserted, so a fresh container isn't bare. Inserted as a deep-cloned,
   * ID-rewritten tree; an explicit slot value (e.g. a variation's innerBlocks)
   * wins. Mirrors Builder.io's `defaultChildren`.
   */
  readonly defaultChildren?: readonly BlockNode[];
  /**
   * Bind this input to a CSS property in the block's `style` slot instead of an
   * attr — the inspector reads/writes `node.style` for the active device, so the
   * control is two-way synced with the Styles tab (both edit the same data).
   * The value is a CSS string (`"800px"`, `"50%"`). Mirrors Builder.io surfacing
   * a style like `width` as a block input.
   */
  readonly styleProperty?: string;
  /**
   * Plugin reference inputs only (e.g. the media picker): the value scope the
   * host control filters by — a MIME prefix (`"image/"`) or exact list. Opaque
   * to the core seam; the host resolver forwards it to the plugin field.
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
   * The value is body copy — running text a reader reads straight through, so
   * reading-length counts include it. Defaults to `true`. Set `false` for text
   * that is findable but not read at prose speed: a code listing, an image's
   * alt attribute, a control's label, a caption, a file name.
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
   * Which of the block's inputs carry text, and how each is encoded. Data
   * rather than a function, so the merged roster over every registered block
   * hashes to an extractor version — a block that adds or changes a declaration
   * invalidates whatever was derived from the old one, with no version integer
   * for an author to keep true.
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
  // The `JsonObject` half is the other half of the contract: a default is
  // merged into a freshly-inserted node's stored attrs, so it has to be JSON —
  // which the materialized `Attrs` need not be.
  readonly defaults?: Readonly<Partial<NoInfer<Attrs>>> & JsonObject;
  /**
   * Default responsive styles seeded into a freshly-inserted block's `style`
   * slot, so they appear as editable values in the Styles section rather than
   * baked, hidden CSS. Use `var(--plumix-…, fallback)` values a theme can
   * override. Mirrors Builder.io's `defaultStyles` (ours is responsive).
   */
  readonly defaultStyles?: ResponsiveStyleSlot;
  readonly placeholder?: string;
  readonly capability?: string;
  readonly transforms?: BlockTransforms;
  readonly variations?: readonly BlockVariation[];
  /**
   * The parent block names this block may be nested under. Set = the block can
   * only be inserted into a matching parent's slot (never at the top level); the
   * inserter hides it elsewhere and a drop into a non-matching parent is
   * refused. The inverse of a slot's `allowedBlocks`. Mirrors Builder.io's
   * `requiresParent`.
   */
  readonly requiresParent?: readonly string[];
  /**
   * The entry types whose editor may offer this block in the inserter. Unset =
   * every type (the default); set = only these types, and the block is hidden
   * from the palette of any other type (or when the type is unknown). Mirrors
   * `PatternSpec.entryTypes`. Scopes only the editor's available-blocks palette;
   * the render registry stays global, so already-stored content still renders
   * regardless of the entry type it lives on.
   */
  readonly entryTypes?: readonly string[];
}

/** The namespace reserved for `@plumix/blocks`' built-in specs. */
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

// Strong typing flows through the inline spec literal (so `render`
// sees `loaders` typed from the `loaders` record, and `defaults` is
// checked against `Attrs`). The return type widens to plain `BlockSpec`
// because `BlockRegistry` stores a homogenized row and `BlockSpec` is
// invariant in both generics. Same shape TanStack uses for
// `match.loaderData`. `Attrs` defaults wide so call sites that read
// extra keys from `attrs` aren't accidentally narrowed by `defaults`.
export function defineBlock<
  Attrs extends MaterializedAttrs = MaterializedAttrs,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  Loaders extends BlockLoaderRecord = {},
>(spec: BlockSpec<Attrs, Loaders>): BlockSpec {
  // Safety: the registry is keyed by block name, so a widened spec only ever
  // meets nodes carrying its own name — `render` is reached solely through
  // that lookup, never by substituting one `BlockSpec` for another. The
  // erasure buys a homogeneous map, not interchangeable specs.
  return Object.freeze(spec) as unknown as BlockSpec;
}
