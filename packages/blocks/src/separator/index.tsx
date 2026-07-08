import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";

export const separatorBlock = defineBlock({
  name: "core/separator",
  title: { id: "block.core.separator.title", message: "Separator" },
  icon: "Minus",
  category: "text",
  // selfSeam so the block class + default styles land on the `<hr>` itself
  // rather than a wrapper div — the rule is the block.
  selfSeam: true,
  // Neutral, theme-overridable defaults seeded as editable Styles values (the
  // Builder model). `border: none` drops the UA bevel so height + background
  // paint a clean line; a theme restyles every separator by defining the vars.
  // Replaces the former `variant` input, which only set a data-attribute no
  // stylesheet read.
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
