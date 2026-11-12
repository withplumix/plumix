import type { BlockNode, BlockRegistry } from "@plumix/core/blocks";
import {
  blockSlotKeys,
  isBlockNodeArray,
  loadedBlocksWithLoaders,
} from "@plumix/core/blocks";

/** Every block name in `tree`, slot children included, in first-seen order. */
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

export interface LoaderBlocksReporter {
  /** Reports the set if it changed since the last report. Call after a load. */
  readonly update: () => void;
  /** Reports the set regardless, for a host that just (re)connected. */
  readonly resend: () => void;
}

/** Reports which loaded blocks declare loaders. */
export function createLoaderBlocksReporter(
  registry: BlockRegistry,
  report: (names: readonly string[]) => void,
): LoaderBlocksReporter {
  let reported: string | null = null;
  const send = (): void => {
    const names = loadedBlocksWithLoaders(registry);
    reported = names.join("\n");
    report(names);
  };
  return {
    update: () => {
      if (loadedBlocksWithLoaders(registry).join("\n") !== reported) send();
    },
    resend: send,
  };
}
