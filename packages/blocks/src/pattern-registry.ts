import type { BlockRegistry } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { PatternRegistryError } from "./pattern-errors.js";
import { isBlockNodeArray } from "./render-block-tree.js";
import { validateEntryContent } from "./validate-content.js";

/**
 * Augmentable registry mapping block name → attrs shape. Plugins and
 * themes extend it via `declare module "@plumix/blocks"` so the `block()`
 * helper can narrow attrs at compile time for known block names.
 *
 * Unknown names fall back to a loose `Record<string, unknown>` — see
 * `AttrsFor` below — so call sites with names the registry hasn't seen
 * still compile.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module-augmentation seam; consumers extend via `declare module`.
export interface BlockTypeRegistry {}

/**
 * Augmentable registry of pattern category slugs. The 8 default
 * categories ship as the seed; plugins / themes augment to add their
 * own.
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
  : Readonly<Record<string, unknown>>;

export type PatternInsertMode = "copy" | "reference";

export interface BlockPattern {
  readonly name: string;
  readonly title: string;
  readonly category?: keyof PatternCategoryRegistry;
  // Defaults to "copy" when unset — the inserter splices a deep-cloned
  // body. "reference" inserts a single `core/pattern-ref` node the
  // walker resolves at render.
  readonly insert?: PatternInsertMode;
  readonly content: readonly BlockNode[];
}

// Pattern-local ID assignment. `block()` writes a junk placeholder ID;
// `definePattern` walks the tree and reassigns `p1, p2, ...` so IDs
// are deterministic per pattern body regardless of how many other
// patterns were defined before this one. Insert paths (slice #638)
// rewrite IDs again — pattern.content IDs only serve React keys
// during preview.
const PLACEHOLDER_ID = "";

export function definePattern(spec: BlockPattern): BlockPattern {
  return Object.freeze({ ...spec, content: assignPatternIds(spec.content) });
}

export function block<TName extends string>(
  name: TName,
  attrs: AttrsFor<TName>,
  options?: { readonly id?: string },
): BlockNode {
  return {
    id: options?.id ?? PLACEHOLDER_ID,
    name,
    attrs,
  };
}

function assignPatternIds(nodes: readonly BlockNode[]): readonly BlockNode[] {
  let counter = 0;
  function walk(input: readonly BlockNode[]): readonly BlockNode[] {
    return input.map((node) => {
      const next: Record<string, unknown> = {};
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

export interface PatternRegistry {
  get(slug: string): BlockPattern | undefined;
  has(slug: string): boolean;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<BlockPattern>;
}

export function createPatternRegistry(
  patterns: readonly BlockPattern[] = [],
): PatternRegistry {
  const map = new Map<string, BlockPattern>();
  for (const pattern of patterns) {
    if (map.has(pattern.name)) {
      throw PatternRegistryError.duplicateSlug(pattern.name);
    }
    map.set(pattern.name, pattern);
  }
  return Object.freeze({
    get: (slug: string) => map.get(slug),
    has: (slug: string) => map.has(slug),
    get size() {
      return map.size;
    },
    [Symbol.iterator]: () => map.values(),
  });
}

const PATTERN_REF_BLOCK_NAME = "core/pattern-ref";

export function commitPatterns(
  patterns: PatternRegistry,
  blocks: BlockRegistry,
): PatternRegistry {
  for (const pattern of patterns) {
    const result = validateEntryContent(
      { version: "plumix.v2", blocks: pattern.content },
      blocks,
    );
    if (!result.ok) {
      const first = result.errors[0];
      throw PatternRegistryError.invalidBody(
        pattern.name,
        first?.path ?? "?",
        first?.message ?? "validation failed",
      );
    }
    validateAttrs(pattern.name, pattern.content, "blocks", blocks);
    validatePatternRefs(pattern.name, pattern.content, "blocks", patterns);
  }
  // Phase 2: walk every pattern body and inline-expand core/pattern-ref
  // nodes so the resolved registry is flat — the entry-level walker
  // never recurses into pattern-body refs at render. Per-host stacks
  // catch ref cycles with the full chain.
  const resolved: BlockPattern[] = [];
  for (const pattern of patterns) {
    const inlined = inlinePatternRefs(pattern.content, patterns, [
      pattern.name,
    ]);
    resolved.push(
      inlined === pattern.content
        ? pattern
        : Object.freeze({ ...pattern, content: inlined }),
    );
  }
  return createPatternRegistry(resolved);
}

function inlinePatternRefs(
  nodes: readonly BlockNode[],
  patterns: PatternRegistry,
  chain: readonly string[],
): readonly BlockNode[] {
  let changed = false;
  const out: BlockNode[] = [];
  for (const node of nodes) {
    if (node.name === PATTERN_REF_BLOCK_NAME) {
      const slug = node.attrs?.slug;
      const target = typeof slug === "string" ? patterns.get(slug) : undefined;
      if (target) {
        if (chain.includes(target.name)) {
          throw PatternRegistryError.cycle([...chain, target.name]);
        }
        const expanded = inlinePatternRefs(target.content, patterns, [
          ...chain,
          target.name,
        ]);
        out.push(...expanded);
        changed = true;
        continue;
      }
    }
    const nextAttrs = inlineRefsInAttrs(node.attrs, patterns, chain);
    if (nextAttrs !== node.attrs) {
      out.push({ ...node, attrs: nextAttrs });
      changed = true;
    } else {
      out.push(node);
    }
  }
  return changed ? out : nodes;
}

function inlineRefsInAttrs(
  attrs: Readonly<Record<string, unknown>> | undefined,
  patterns: PatternRegistry,
  chain: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  if (!attrs) return attrs;
  let mutated: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (isBlockNodeArray(value)) {
      const next = inlinePatternRefs(value, patterns, chain);
      if (next !== value) {
        mutated ??= { ...attrs };
        mutated[key] = next;
      }
    }
  }
  return mutated ?? attrs;
}

function validatePatternRefs(
  patternName: string,
  nodes: readonly BlockNode[],
  basePath: string,
  patterns: PatternRegistry,
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${i}]`;
    if (node.name === PATTERN_REF_BLOCK_NAME) {
      const slug = node.attrs?.slug;
      if (typeof slug === "string" && !patterns.has(slug)) {
        throw PatternRegistryError.unresolvedRef(patternName, path, slug);
      }
      return;
    }
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      if (isBlockNodeArray(value)) {
        validatePatternRefs(patternName, value, `${path}.${key}`, patterns);
      }
    }
  });
}

function validateAttrs(
  patternName: string,
  nodes: readonly BlockNode[],
  basePath: string,
  blocks: BlockRegistry,
): void {
  nodes.forEach((node, i) => {
    const path = `${basePath}[${i}]`;
    const spec = blocks.get(node.name);
    // Block-name existence is the validateEntryContent layer's job.
    // Attr-key check only fires when the block declares inputs; slot
    // recursion runs either way so inputless wrapper blocks don't hide
    // unknown attrs deeper in the tree.
    const declared = spec?.inputs
      ? new Set(spec.inputs.map((input) => input.name))
      : undefined;
    for (const [key, value] of Object.entries(node.attrs ?? {})) {
      if (declared && !declared.has(key)) {
        throw PatternRegistryError.undeclaredAttr(
          patternName,
          path,
          node.name,
          key,
        );
      }
      if (isBlockNodeArray(value)) {
        validateAttrs(patternName, value, `${path}.${key}`, blocks);
      }
    }
  });
}
