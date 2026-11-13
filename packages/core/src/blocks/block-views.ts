import type {
  BlockRegistry,
  BlockSpec,
  BlockViewModule,
} from "./block-registry.js";

/**
 * Thrown when something renders a block, or reads its loaders or deps, before
 * its view module is loaded.
 */
export class BlockViewNotLoadedError extends Error {
  static {
    BlockViewNotLoadedError.prototype.name = "BlockViewNotLoadedError";
  }

  constructor(blockName: string) {
    super(
      `The view of block "${blockName}" isn't loaded. Call loadBlockViews(registry) before rendering it.`,
    );
  }
}

/** Keyed by spec, not name, so two registries sharing a name never share a view. */
const loaded = new WeakMap<BlockSpec, BlockViewModule>();
const pending = new WeakMap<BlockSpec, Promise<void>>();

function loadOne(spec: BlockSpec): Promise<void> {
  if (loaded.has(spec)) return Promise.resolve();
  let promise = pending.get(spec);
  if (!promise) {
    promise = spec.view().then(
      (module) => {
        loaded.set(spec, module);
      },
      (error: unknown) => {
        // A failed import isn't cached, so a later call retries it.
        pending.delete(spec);
        throw error;
      },
    );
    pending.set(spec, promise);
  }
  return promise;
}

/**
 * A failure rejects only after the other imports settle, so one lost chunk
 * leaves every other view usable.
 */
export async function loadBlockViews(
  registry: BlockRegistry,
  names?: Iterable<string>,
): Promise<void> {
  const specs: BlockSpec[] = [];
  if (names === undefined) {
    specs.push(...registry);
  } else {
    for (const name of names) {
      const spec = registry.get(name);
      if (spec) specs.push(spec);
    }
  }
  const settled = await Promise.allSettled(specs.map(loadOne));
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

/**
 * The blocks whose view module is loaded and declares loaders, for a surface
 * that holds definitions only and must learn which blocks have loaders.
 */
export function loadedBlocksWithLoaders(registry: BlockRegistry): string[] {
  const names: string[] = [];
  for (const spec of registry) {
    if (loaded.get(spec)?.loaders) names.push(spec.name);
  }
  return names;
}

export function blockViewModule(spec: BlockSpec): BlockViewModule {
  const module = loaded.get(spec);
  if (!module) throw new BlockViewNotLoadedError(spec.name);
  return module;
}
