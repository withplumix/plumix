import type { BlockSpec } from "@plumix/core/blocks";
import { createBlockRegistry } from "@plumix/core/blocks";

const slotted = (name: string, slots: readonly string[]): BlockSpec => ({
  name,
  render: () => null,
  inputs: slots.map((slot) => ({ name: slot, type: "slot" })),
});

/**
 * `core/columns` takes two named slots so a multi-slot block needs no extra
 * fixture.
 */
export const treeBlocks = createBlockRegistry([
  slotted("core/group", ["content"]),
  slotted("core/columns", ["left", "right"]),
  slotted("core/table", ["rows"]),
  slotted("core/table-header-row", ["cells"]),
  slotted("core/table-body-row", ["cells"]),
  slotted("acme/team", []),
]);
