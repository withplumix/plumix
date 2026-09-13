import type { Label } from "./i18n-label.js";
import type { JsonObject, JsonValue } from "./json.js";
import type { BlockNode } from "./render-block-tree.js";
import type { ResponsiveStyleSlot } from "./styles/style-emitter.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * Augmentable registry mapping block name → attrs shape. Plugins and
 * themes extend it via `declare module "plumix"` so the `block()`
 * helper can narrow attrs at compile time for known block names.
 *
 * Unknown names fall back to `JsonObject` — see `AttrsFor` below — so call
 * sites with names the registry hasn't seen still compile. An augmentation's
 * value type has to be JSON-assignable.
 *
 * ```ts
 * declare module "plumix" {
 *   interface BlockTypeRegistry {
 *     "acme/hero": { heading: string };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module-augmentation seam; consumers extend via `declare module`.
export interface BlockTypeRegistry {}

/**
 * Augmentable registry of pattern category slugs. The 8 default
 * categories ship as the seed; plugins / themes augment via
 * `declare module "plumix"` to add their own.
 *
 * ```ts
 * declare module "plumix" {
 *   interface PatternCategoryRegistry {
 *     newsletter: true;
 *   }
 * }
 * ```
 */
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

// `block()` writes a blank placeholder ID; `definePattern` numbers nodes
// `p1, p2, ...` per pattern body so preview React keys are stable. Inserting
// rewrites them.
const PLACEHOLDER_ID = "";

export function definePattern(spec: BlockPattern): BlockPattern {
  return Object.freeze({ ...spec, content: assignPatternIds(spec.content) });
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

function assignPatternIds(nodes: readonly BlockNode[]): readonly BlockNode[] {
  let counter = 0;
  function walk(input: readonly BlockNode[]): readonly BlockNode[] {
    return input.map((node) => {
      const next: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(node.attrs ?? {})) {
        next[key] = isBlockNodeArray(value) ? walk(value) : value;
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
