import type { JsonObject } from "../json.js";
import type { BlockRegistry, BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * Imported from here only: augmentations miss re-exports.
 *
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
 * An array replaces the inherited keys, `(prev) => next` composes them, `[]`
 * disables the dep, and an omitted kind inherits unchanged. A block inherits
 * nothing, so its `prev` is `[]`.
 */
export type TemplateDepDeclarations = {
  readonly [K in keyof TemplateDepRegistry]?:
    | readonly TemplateDepKey<K>[]
    | ((prev: readonly TemplateDepKey<K>[]) => readonly TemplateDepKey<K>[]);
};

/**
 * Rejects a kind no `TemplateDepRegistry` entry names. Checked on the spec, not
 * as `Deps`'s constraint, so the constraint still types a kind's `prev`.
 */
export interface KnownBlockDepKinds<Attrs, D> {
  readonly deps?: BlockDeps<
    Attrs,
    Readonly<Record<Exclude<keyof D, keyof TemplateDepRegistry>, never>>
  >;
}

type DeclaredKey<V> = V extends readonly (infer Key extends string)[]
  ? Key
  : V extends (prev: never) => readonly (infer Key extends string)[]
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
export type BlockDeps<Attrs, D> =
  // The intersection types a kind's `prev`, which `D` alone can't while it is
  // still being inferred.
  (D & TemplateDepDeclarations) | ((attrs: Attrs) => D);

/** Each dep kind's keys, as the loaders take them. */
export type DepKeys = Readonly<Record<string, readonly string[]>>;

/**
 * Not JSON: a loader returns whatever its kind is about, and it reaches the
 * block untouched.
 */
export type LoadedDeps = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

const NO_INHERITED_KEYS: readonly string[] = [];

export function blockDepKeys(spec: BlockSpec, node: BlockNode): DepKeys {
  const { deps } = spec;
  if (deps === undefined) return {};
  const declared: unknown =
    typeof deps === "function" ? deps(node.attrs ?? {}) : deps;
  if (typeof declared !== "object" || declared === null) return {};
  const keys: Record<string, readonly string[]> = {};
  for (const [kind, value] of Object.entries(declared)) {
    const declaredKeys: unknown =
      typeof value === "function"
        ? (value as (prev: readonly string[]) => readonly unknown[])(
            NO_INHERITED_KEYS,
          )
        : value;
    if (!Array.isArray(declaredKeys)) continue;
    keys[kind] = declaredKeys.filter(
      (key): key is string => typeof key === "string",
    );
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
