import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const separatorBlock = defineBlock({
  name: "core/separator",
  title: { id: "block.core.separator.title", message: "Separator" },
  icon: "Minus",
  category: "text",
  // The rule is the block, so styles land on the `<hr>`, not a wrapper.
  selfSeam: true,
  // `border: none` drops the UA bevel so height and background paint a clean
  // line.
  defaultStyles: {
    large: {
      border: "none",
      height: "var(--plumix-separator-thickness, 1px)",
      backgroundColor: "var(--plumix-separator-color, #e5e7eb)",
      marginTop: "var(--plumix-separator-margin-y, 1.5rem)",
      marginBottom: "var(--plumix-separator-margin-y, 1.5rem)",
    },
  },
  render: ({ blockProps }): ReactNode => <hr {...blockProps} />,
});
