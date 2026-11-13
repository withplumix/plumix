import type { BlockNode, BlockRegistry } from "@plumix/core/blocks";
import {
  blockSlotKeys,
  isBlockNodeArray,
  loadBlockViews,
  loadedBlocksWithLoaders,
} from "@plumix/core/blocks";

export function treeBlockNames(
  tree: readonly BlockNode[],
  registry: BlockRegistry,
): Set<string> {
  const names = new Set<string>();
  const visit = (nodes: readonly BlockNode[]): void => {
    for (const node of nodes) {
      names.add(node.name);
      for (const key of blockSlotKeys(node, registry.get(node.name))) {
        const children = node.attrs?.[key];
        if (isBlockNodeArray(children)) visit(children);
      }
    }
  };
  visit(tree);
  return names;
}

type LoadViewModules = (names: Iterable<string>) => Promise<void>;

/**
 * A tree offered while an earlier one loads supersedes it, so a slow import
 * never paints a tree the host has since replaced.
 */
export function createTreeCommitter(
  registry: BlockRegistry,
  load: LoadViewModules,
): (
  tree: readonly BlockNode[],
  commit: (tree: readonly BlockNode[]) => void,
) => Promise<void> {
  let latest = 0;
  return async (tree, commit) => {
    latest += 1;
    const offered = latest;
    await load(treeBlockNames(tree, registry));
    if (offered === latest) commit(tree);
  };
}

const VIEW_MODULE_LOAD_FAILED =
  "[plumix:editor] A block's view module failed to load; the canvas keeps what it shows and retries on the next update.";

/** A chunk lost after a deploy must not break the canvas. */
export function settleViewModuleLoad(
  load: Promise<void>,
  afterLoad: () => void,
): Promise<void> {
  return load
    .catch((error: unknown) => {
      console.error(VIEW_MODULE_LOAD_FAILED, error);
    })
    .finally(afterLoad);
}

/** An empty seed when its views fail lets the host's first tree push retry them. */
export async function seedTree(
  registry: BlockRegistry,
  tree: readonly BlockNode[],
): Promise<readonly BlockNode[]> {
  try {
    await loadBlockViews(registry, treeBlockNames(tree, registry));
    return tree;
  } catch (error) {
    console.error(VIEW_MODULE_LOAD_FAILED, error);
    return [];
  }
}

export interface LoaderBlocksReporter {
  readonly update: () => void;
  readonly resend: () => void;
}

export function createLoaderBlocksReporter(
  registry: BlockRegistry,
  report: (names: readonly string[]) => void,
): LoaderBlocksReporter {
  let reported: readonly string[] | null = null;
  const send = (names: readonly string[]): void => {
    reported = names;
    report(names);
  };
  return {
    update: () => {
      const names = loadedBlocksWithLoaders(registry);
      const unchanged =
        reported?.length === names.length &&
        names.every((name, i) => name === reported?.[i]);
      if (!unchanged) send(names);
    },
    resend: () => {
      send(loadedBlocksWithLoaders(registry));
    },
  };
}

export interface ScheduledViewModuleLoads {
  readonly prefetch: (names: readonly string[]) => void;
  readonly cancel: () => void;
}

/** Every view module loads at idle, so an insert seldom waits on an import. */
export function scheduleViewModuleLoads(
  registry: BlockRegistry,
  afterLoad: () => void,
): ScheduledViewModuleLoads {
  const load = (names?: Iterable<string>): void =>
    void settleViewModuleLoad(loadBlockViews(registry, names), afterLoad);
  return { prefetch: load, cancel: whenIdle(() => load()) };
}

/** The timer covers browsers with no `requestIdleCallback`, such as Safari. */
function whenIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task);
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 1);
  return () => clearTimeout(handle);
}
