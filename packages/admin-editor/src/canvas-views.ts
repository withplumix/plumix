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

type LoadViews = (names: Iterable<string>) => Promise<void>;

/**
 * Commits each offered tree once its blocks' views have loaded. A tree offered
 * while an earlier one loads supersedes it, which then never commits.
 */
export function createTreeCommitter(
  registry: BlockRegistry,
  load: LoadViews,
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

const VIEW_LOAD_FAILED =
  "[plumix:editor] A block view failed to load; the canvas keeps what it shows and retries on the next update.";

/**
 * Settles a view load without rejecting. A failed import, such as a chunk gone
 * after a deploy, is logged, and the next load naming it retries it.
 */
export function settleViewLoad(
  load: Promise<void>,
  afterLoad: () => void,
): Promise<void> {
  return load
    .catch((error: unknown) => {
      console.error(VIEW_LOAD_FAILED, error);
    })
    .finally(afterLoad);
}

/**
 * The tree the canvas first renders: the seed once its views load, or an empty
 * tree when they fail, which the host's first tree push then retries.
 */
export async function seedTree(
  registry: BlockRegistry,
  tree: readonly BlockNode[],
): Promise<readonly BlockNode[]> {
  try {
    await loadBlockViews(registry, treeBlockNames(tree, registry));
    return tree;
  } catch (error) {
    console.error(VIEW_LOAD_FAILED, error);
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
