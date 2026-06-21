import { defineBlock } from "../block-registry.js";

// Reference to a registered pattern. Walker special-cases this name
// and renders the resolved body; this spec exists so the registry
// recognises the block and the admin's editor adapter has a target to
// map. Render returns nothing because walker resolution overrides it.
export const patternRefBlock = defineBlock({
  name: "core/pattern-ref",
  title: "Pattern reference",
  inserter: false,
  inputs: [{ name: "slug", type: "text", label: "Slug" }],
  render: () => null,
});
