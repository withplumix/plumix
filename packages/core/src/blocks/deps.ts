// In the foundation layer so `blocks/` can type a block's deps (ADR 0010).
// Core imports the registry from here only: a `plumix` augmentation misses
// references reached through a re-export.

import type { JsonObject } from "../json.js";
import type { BlockRegistry, BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * Augmented per kind as `{ slug | location: string; result }`. The loader
 * receives keys under that name, so reading the wrong one does not compile.
 *
 * ```ts
 * declare module "plumix" {
 *   interface TemplateDepRegistry {
 *     menus: { location: string; result: ResolvedMenu };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional augmentation seam
export interface TemplateDepRegistry {}

type TemplateDepKeyField = "slug" | "location";

/** The key field kind `K`'s registry entry declares. */
export type TemplateDepKeyedBy<K extends keyof TemplateDepRegistry> =
  keyof TemplateDepRegistry[K] & TemplateDepKeyField;

export type TemplateDepKey<K extends keyof TemplateDepRegistry> =
  TemplateDepRegistry[K][TemplateDepKeyedBy<K>];

/**
 * The keys a block reads per dep kind. Arrays only: a block has no inherited
 * declaration for a `(prev) => next` form to compose.
 */
export type BlockDepDeclarations = {
  readonly [K in keyof TemplateDepRegistry]?: readonly TemplateDepKey<K>[];
};

/** Rejects a kind no `TemplateDepRegistry` entry names. */
export type KnownBlockDepKinds<D> = BlockDepDeclarations &
  Readonly<Record<Exclude<keyof D, keyof TemplateDepRegistry>, never>>;

type DeclaredKey<V> = V extends readonly (infer Key extends string)[]
  ? Key
  : never;

/**
 * What `render` reads: each declared kind's results under each declared key,
 * `null` when the loader returned nothing for it or threw.
 */
export type BlockDepResults<D> = {
  readonly [K in keyof D & keyof TemplateDepRegistry]-?: Readonly<
    Record<DeclaredKey<D[K]>, TemplateDepRegistry[K]["result"] | null>
  >;
};

/**
 * Static, or a pure function of the block's stored attributes, so a page can
 * collect every block's keys before anything renders.
 */
export type BlockDeps<Attrs, D> = D | ((attrs: Attrs) => D);

/** Each dep kind's keys, as the loaders take them. */
export type DepKeys = Readonly<Record<string, readonly string[]>>;

/**
 * Not JSON: a loader returns whatever its kind is about, and it reaches the
 * block untouched.
 */
export type LoadedDeps = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

/** The keys one node's block declares, evaluated against its attributes. */
export function blockDepKeys(spec: BlockSpec, node: BlockNode): DepKeys {
  const { deps } = spec;
  if (deps === undefined) return {};
  const declared: unknown =
    typeof deps === "function" ? deps(node.attrs ?? {}) : deps;
  if (typeof declared !== "object" || declared === null) return {};
  const keys: Record<string, readonly string[]> = {};
  for (const [kind, value] of Object.entries(declared)) {
    if (!Array.isArray(value)) continue;
    keys[kind] = value.filter((key): key is string => typeof key === "string");
  }
  return keys;
}

/**
 * The union of the keys every block in `trees` declares, slots included. Each
 * kind's keys are de-duplicated, so twenty instances ask once.
 */
export function collectBlockDepKeys(
  trees: readonly (readonly BlockNode[])[],
  registry: BlockRegistry,
): DepKeys {
  const union = new Map<string, Set<string>>();
  const visit = (nodes: readonly BlockNode[]): void => {
    for (const node of nodes) {
      const spec = registry.get(node.name);
      if (!spec) continue;
      for (const [kind, keys] of Object.entries(blockDepKeys(spec, node))) {
        const set = union.get(kind) ?? new Set<string>();
        for (const key of keys) set.add(key);
        union.set(kind, set);
      }
      const attrs: JsonObject = node.attrs ?? {};
      for (const slot of blockSlotKeys(node, spec)) {
        const children = attrs[slot];
        if (isBlockNodeArray(children)) visit(children);
      }
    }
  };
  for (const tree of trees) visit(tree);
  return Object.fromEntries(
    [...union].map(([kind, keys]) => [kind, [...keys]]),
  );
}

/** `null` for a declared key `loaded` lacks. */
export function pickDeps(keys: DepKeys, loaded: LoadedDeps): LoadedDeps {
  const picked: Record<string, LoadedDeps[string]> = {};
  for (const [kind, kindKeys] of Object.entries(keys)) {
    const results = loaded[kind] ?? {};
    picked[kind] = Object.fromEntries(
      kindKeys.map((key) => [key, results[key] ?? null]),
    );
  }
  return picked;
}
