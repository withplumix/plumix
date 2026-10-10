import type { JsonObject } from "../json.js";
import type { BlockRegistry, BlockSpec } from "./block-registry.js";
import type { BlockNode } from "./render-block-tree.js";
import { blockSlotKeys } from "./block-slots.js";
import { isBlockNodeArray } from "./render-block-tree.js";

/**
 * `blocks/` sits below `context/`, so `AppContext` can't be named here; the
 * `plumix/blocks` façade fills this in, and without it the type is `unknown`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module-augmentation seam; only the `plumix/blocks` façade fills it.
export interface BlockLoaderContextRegistry {}

export type BlockLoaderContext = BlockLoaderContextRegistry extends {
  readonly ctx: infer C;
}
  ? C
  : unknown;

/**
 * Throwing `pageNotFound()` or `redirectTo()` ends the request only for the
 * page's own content; elsewhere it is an ordinary rejection isolated to its
 * block.
 */
export interface BlockLoaderArgs {
  /**
   * The request's `AppContext`. When the editor refreshes a loader no public
   * URL was matched, so `resolvedEntity` and `resolvedRoute` are `null` there
   * and a loader must handle that.
   */
  readonly ctx: BlockLoaderContext;
  readonly attrs: JsonObject;
}

/**
 * Type-erased storage bound only: blocks keep concrete loader types through
 * inference, and nothing calls a loader through this type.
 */
// eslint-disable-next-line plumix/no-unknown-return
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

/**
 * Not JSON: the block reads it in the same process. Only the edit page's
 * seeded copy crosses a wire, lossily.
 */
export type LoaderResults = Readonly<Record<string, unknown>>;

// Resolved data for one block. On success: `loaders` carries the
// resolved record, `error` is `null`. On any rejection: `loaders` is
// `{}`, `error` carries the first rejection (per-block isolation —
// siblings are unaffected).
export interface ResolvedBlockLoaderData {
  readonly loaders: LoaderResults;
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
    for (const key of blockSlotKeys(node, spec)) {
      const value = node.attrs?.[key];
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

/**
 * The message embeds block, loader key and failure text so the dev error
 * page's hint matchers still match; the cause's stack is adopted so frames
 * point at the loader.
 */
export class BlockLoaderError extends Error {
  static {
    BlockLoaderError.prototype.name = "BlockLoaderError";
  }

  constructor(event: LoaderErrorEvent) {
    const cause = event.error;
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `Block loader "${event.key}" on "${event.spec.name}" threw: ${detail}`,
      { cause },
    );
    // Adopt the loader's own stack so the dev error page resolves frames to the
    // failure site inside the loader, not this escalation wrapper.
    if (cause instanceof Error && cause.stack) this.stack = cause.stack;
  }
}

export interface ResolveBlockLoadersOptions {
  /**
   * Blocks can't depend on core's hook system, so the dispatcher bridges this
   * into `blocks:loader:error`. Fires once per rejected loader.
   */
  readonly onLoaderError?: (event: LoaderErrorEvent) => void;
}

/**
 * One rejected loader doesn't fail siblings: its block gets `loaders: {}` and
 * the first rejection in declaration order.
 */
export async function resolveBlockLoaders(
  nodes: readonly BlockNode[],
  registry: BlockRegistry,
  ctx: BlockLoaderContext,
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
  ctx: BlockLoaderContext,
  onLoaderError: ((event: LoaderErrorEvent) => void) | undefined,
): Promise<ResolvedBlockLoaderData> {
  // `Promise.resolve().then` turns a sync throw into a rejection so it can't
  // escape `Promise.all` and break per-block isolation.
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
