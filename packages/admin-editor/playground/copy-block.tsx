import type { BlockNode, BlockSpec, LoadedDeps } from "@plumix/core/blocks";

/**
 * Reads the settings group its `group` attr names. With no SSR in this
 * harness, the canvas asks the host's stub for every group it renders.
 */
export const copySpec: BlockSpec = {
  name: "playground/copy",
  inputs: [{ name: "group", type: "text", label: "Group" }],
  view: () => import("./copy-block.view.js"),
};

/** The host's stand-in for `entry.resolveBlockDeps`: copy for every group. */
export function resolveCopyDeps(
  tree: readonly BlockNode[],
): Promise<LoadedDeps> {
  const groups = tree
    .filter((node) => node.name === copySpec.name)
    .map((node) => node.attrs?.group)
    .filter((group): group is string => typeof group === "string");
  return Promise.resolve({
    settings: Object.fromEntries(
      groups.map((group) => [group, { title: `copy for ${group}` }]),
    ),
  });
}

export const COPY_SEED: BlockNode = {
  id: "copy-1",
  name: "playground/copy",
  attrs: { group: "school_ks2" },
};
