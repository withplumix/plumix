import type { Label } from "../i18n/label.js";
import type { JsonObject, JsonValue } from "../json.js";
import type { BlockSpecLookup } from "./block-slots.js";
import type { BlockNode } from "./render-block-tree.js";
import type { ResponsiveStyleSlot } from "./styles/style-emitter.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * Augment via `declare module "plumix"` to narrow `block()` attrs. Unknown
 * names fall back to `JsonObject`; an augmentation's value type must be
 * JSON-assignable.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module-augmentation seam; consumers extend via `declare module`.
export interface BlockTypeRegistry {}

/** Augment via `declare module "plumix"` to add categories. */
export interface PatternCategoryRegistry {
  readonly hero: true;
  readonly cta: true;
  readonly features: true;
  readonly testimonials: true;
  readonly pricing: true;
  readonly header: true;
  readonly footer: true;
  readonly content: true;
}

type AttrsFor<TName extends string> = TName extends keyof BlockTypeRegistry
  ? BlockTypeRegistry[TName]
  : JsonObject;

export interface PatternPreview {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt?: string;
}

export type PatternTarget = "post-content";

export interface BlockPattern {
  readonly name: string;
  readonly title: Label;
  readonly category?: keyof PatternCategoryRegistry;
  readonly keywords?: readonly Label[];
  // Static preview override. When set, the inserter renders an <img>
  // at the declared dimensions instead of live-rendering `content`.
  readonly preview?: PatternPreview;
  // Marks the pattern as eligible for the starter modal when the
  // matching entry type is being authored from scratch.
  readonly target?: PatternTarget;
  readonly entryTypes?: readonly string[];
  // Lower numbers float to the top of the starter modal; ties break
  // alphabetically by name.
  readonly priority?: number;
  readonly content: readonly BlockNode[];
}

// `block()` writes a blank placeholder ID; `assignPatternIds` numbers nodes
// `p1, p2, ...` per pattern body so preview React keys are stable. Inserting
// rewrites them.
const PLACEHOLDER_ID = "";

export function definePattern(spec: BlockPattern): BlockPattern {
  return Object.freeze({ ...spec });
}

export function block<TName extends string>(
  name: TName,
  attrs: AttrsFor<TName>,
  options?: {
    readonly id?: string;
    readonly style?: ResponsiveStyleSlot;
  },
): BlockNode {
  const base: BlockNode = {
    id: options?.id ?? PLACEHOLDER_ID,
    name,
    attrs,
  };
  return options?.style ? { ...base, style: options.style } : base;
}

/**
 * Ids the author wrote are kept. Run where the block registry is known, which
 * a pattern's definition is not.
 */
export function assignPatternIds(
  nodes: readonly BlockNode[],
  blocks: BlockSpecLookup,
): readonly BlockNode[] {
  let counter = 0;
  function walk(input: readonly BlockNode[]): readonly BlockNode[] {
    return input.map((node) => {
      const next: Record<string, JsonValue> = { ...node.attrs };
      for (const key of blockSlotKeys(node, blocks.get(node.name))) {
        const value = next[key];
        if (isBlockNodeArray(value)) next[key] = walk(value);
      }
      return {
        ...node,
        id: node.id || `p${++counter}`,
        attrs: next,
      };
    });
  }
  return walk(nodes);
}
