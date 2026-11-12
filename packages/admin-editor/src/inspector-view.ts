import type {
  BlockInput,
  BlockNode,
  BlockRegistry,
  JsonValue,
} from "@plumix/core/blocks";

import type { LayoutGate } from "./layout-gate.js";
import type { StyleBucket } from "./store.js";
import { enclosingTableId, findBlock } from "./block-tree-ops.js";
import { layoutGate } from "./layout-gate.js";

interface InspectorInput {
  readonly input: BlockInput;
  /** The value the control shows: the attr, or for a `styleProperty` input
   *  the active bucket's style value. */
  readonly value: JsonValue | undefined;
}

export interface InspectorView {
  readonly block: BlockNode;
  /** The site registers no such block, so the panel offers nothing to edit. */
  readonly unregistered: boolean;
  /** Registered, but outside the theme's allowed blocks: still editable. */
  readonly notAllowed: boolean;
  readonly inputs: readonly InspectorInput[];
  readonly showAddColumn: boolean;
  /** The table whose rows and columns the table controls edit. */
  readonly tableId: string | null;
  readonly showRefresh: boolean;
  /** Nothing to render would leave a blank panel, indistinguishable from one
   *  that failed to load. */
  readonly nothingToSet: boolean;
}

/**
 * The inspector's view of the active block, or `null` when none is selected.
 * `loaderBlocks` names the blocks the canvas reported declaring loaders.
 */
export function inspectorView(
  registry: BlockRegistry,
  tree: readonly BlockNode[],
  activeId: string | null,
  bucket: StyleBucket,
  canRefresh: boolean,
  loaderBlocks: ReadonlySet<string>,
  allowed?: ReadonlySet<string>,
  layout: LayoutGate = layoutGate(true),
): InspectorView | null {
  const block = activeId ? findBlock(tree, activeId, registry) : undefined;
  if (!block) return null;

  const spec = registry.get(block.name);
  // A slot input as a control would overwrite the children with a string.
  const inputs = (spec?.inputs ?? [])
    .filter((input) => input.type !== "slot" && layout.offersInput(input))
    .map((input): InspectorInput => {
      const styleProp = input.styleProperty;
      if (!styleProp) return { input, value: block.attrs?.[input.name] };
      // A cleared Custom-CSS declaration can leave "" in the bucket; read it
      // as unset.
      const stored = block.style?.[bucket]?.[styleProp];
      return { input, value: stored === "" ? undefined : stored };
    });
  // The table the selection sits in, so its controls stay in reach while
  // editing a cell. Adding a row or column inserts blocks: layout.
  const tableId = layout.editsLayout
    ? enclosingTableId(tree, block.id, registry)
    : null;
  // A block with no loader data yet, such as one just inserted, still shows
  // it: refresh is how it gets its data.
  const showRefresh = canRefresh && loaderBlocks.has(block.name);
  const showAddColumn = layout.editsLayout && block.name === "core/columns";

  return {
    block,
    unregistered: !spec,
    notAllowed:
      Boolean(spec) && allowed !== undefined && !allowed.has(block.name),
    inputs,
    showAddColumn,
    tableId,
    showRefresh,
    nothingToSet:
      Boolean(spec) &&
      inputs.length === 0 &&
      !showAddColumn &&
      !tableId &&
      !showRefresh,
  };
}
