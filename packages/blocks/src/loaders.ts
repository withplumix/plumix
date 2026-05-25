import type { BlockRegistry, BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

// `ctx` is `unknown` here because `@plumix/blocks` can't depend on
// `@plumix/core` (where `AppContext` lives) — core depends on blocks.
// Block authors typically widen it themselves or pull from a typed
// re-export at the consumer boundary.
export interface BlockLoaderArgs {
  readonly ctx: unknown;
  readonly attrs: Readonly<Record<string, unknown>>;
}

export type BlockLoaderFn = (args: BlockLoaderArgs) => Promise<unknown>;
export type BlockLoaderRecord = Readonly<Record<string, BlockLoaderFn>>;

// Maps a loader record to the shape `render` sees after SSR resolution
// (one loader fn → its awaited return type, keyed the same way). Same
// pattern as TanStack Router's `ResolveLoaderData`.
export type ResolvedLoaders<L extends BlockLoaderRecord> = {
  readonly [K in keyof L]: Awaited<ReturnType<L[K]>>;
};

export interface LoaderEntry {
  readonly nodeId: string;
  readonly node: BlockNode;
  readonly spec: BlockSpec;
}

// Resolved data for one block. On success: `loaders` carries the
// resolved record, `error` is `null`. On any rejection: `loaders` is
// `{}`, `error` carries the first rejection (per-block isolation —
// siblings are unaffected).
export interface ResolvedBlockLoaderData {
  readonly loaders: Readonly<Record<string, unknown>>;
  readonly error: unknown;
}

export type ResolvedBlockLoaders = ReadonlyMap<string, ResolvedBlockLoaderData>;

export function collectLoaderEntries(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
): readonly LoaderEntry[] {
  const out: LoaderEntry[] = [];
  collectInto(nodes, registry, out);
  return out;
}

function collectInto(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
  out: LoaderEntry[],
): void {
  for (const node of nodes) {
    const spec = registry.get(node.name);
    if (spec?.loaders) out.push({ nodeId: node.id, node, spec });
    if (!node.attrs) continue;
    for (const value of Object.values(node.attrs)) {
      if (isBlockNodeArray(value)) collectInto(value, registry, out);
    }
  }
}

export interface LoaderErrorEvent {
  readonly spec: BlockSpec;
  readonly node: BlockNode;
  readonly key: string;
  readonly error: unknown;
}

export interface ResolveBlockLoadersOptions {
  // Fires once per rejected loader (not once per block). Used by the
  // core dispatcher to bridge into the `blocks:loader:error` filter —
  // blocks can't depend on core's hook system, so the wire-up lives at
  // the dispatcher layer.
  readonly onLoaderError?: (event: LoaderErrorEvent) => void;
}

// Walks the block tree, fires every declared loader in parallel, and
// returns a map keyed by node id. Per-block isolation: one rejected
// loader doesn't fail siblings — its block ends up with `loaders: {}`
// and `error: <first-rejection-in-declaration-order>`.
export async function resolveBlockLoaders(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
  ctx: unknown,
  options: ResolveBlockLoadersOptions = {},
): Promise<ResolvedBlockLoaders> {
  const entries = collectLoaderEntries(nodes, registry);
  if (entries.length === 0) return new Map();
  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const data = await resolveEntry(entry, ctx, options.onLoaderError);
      return [entry.nodeId, data] as const;
    }),
  );
  return new Map(resolved);
}

async function resolveEntry(
  entry: LoaderEntry,
  ctx: unknown,
  onLoaderError: ((event: LoaderErrorEvent) => void) | undefined,
): Promise<ResolvedBlockLoaderData> {
  // `Promise.resolve().then(...)` traps a synchronous throw from `fn`
  // and re-routes it through `.then`'s rejection branch. Without this,
  // a sync throw escapes the `Promise.all` below and rejects the entire
  // `resolveBlockLoaders` call — breaking the per-block isolation
  // contract. Order-preserving: `firstError` is the first rejection in
  // declaration order, not first-by-time.
  const settled = await Promise.all(
    Object.entries(entry.spec.loaders ?? {}).map(([key, fn]) =>
      Promise.resolve()
        .then(() => fn({ ctx, attrs: entry.node.attrs ?? {} }))
        .then(
          (value): SettledLoader => ({ key, ok: true, value }),
          (reason: unknown): SettledLoader => ({ key, ok: false, reason }),
        ),
    ),
  );
  const loaders: Record<string, unknown> = {};
  let firstError: unknown = null;
  for (const item of settled) {
    if (item.ok) {
      loaders[item.key] = item.value;
      continue;
    }
    if (firstError === null) firstError = item.reason;
    onLoaderError?.({
      spec: entry.spec,
      node: entry.node,
      key: item.key,
      error: item.reason,
    });
  }
  return firstError === null
    ? { loaders, error: null }
    : { loaders: {}, error: firstError };
}

type SettledLoader =
  | { readonly key: string; readonly ok: true; readonly value: unknown }
  | { readonly key: string; readonly ok: false; readonly reason: unknown };
