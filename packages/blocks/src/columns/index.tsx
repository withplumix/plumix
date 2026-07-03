import type { ReactNode } from "react";

import type { BlockNode } from "../render-block-tree.js";
import type { ThemeBreakpoints } from "../styles/style-emitter.js";
import { defineBlock } from "../block-registry.js";
import { DEFAULT_BREAKPOINTS } from "../styles/style-emitter.js";

// Two equal columns, each seeded with a paragraph so a fresh row isn't bare.
const DEFAULT_COLUMNS: readonly BlockNode[] = [
  {
    id: "column-1",
    name: "core/column",
    attrs: {
      content: [
        {
          id: "column-1-text",
          name: "core/rich-text",
          attrs: { body: "<p>Column</p>" },
        },
      ],
    },
  },
  {
    id: "column-2",
    name: "core/column",
    attrs: {
      content: [
        {
          id: "column-2-text",
          name: "core/rich-text",
          attrs: { body: "<p>Column</p>" },
        },
      ],
    },
  },
];

const STACK_AT = ["tablet", "mobile", "never"] as const;
type StackAt = (typeof STACK_AT)[number];

function pickStackAt(raw: unknown): StackAt {
  return typeof raw === "string" &&
    (STACK_AT as readonly string[]).includes(raw)
    ? (raw as StackAt)
    : "tablet";
}

// A scoped media query that flips the row to a stacked column at the chosen
// breakpoint (Builder's stackColumnsAt). Emitted by the block itself — theme
// breakpoints in, per-instance class out — so it respects a theme's viewports.
function stackStyleCss(
  nodeId: string,
  stackAt: StackAt,
  reverse: boolean,
  breakpoints: ThemeBreakpoints,
): string {
  if (stackAt === "never") return "";
  const max = stackAt === "mobile" ? breakpoints.mobile : breakpoints.tablet;
  const direction = reverse ? "column-reverse" : "column";
  return `@media (max-width: ${String(max)}px) { .plumix-cols-${nodeId} { flex-direction: ${direction}; } }`;
}

export const columnsBlock = defineBlock({
  name: "core/columns",
  title: "Columns",
  icon: "Columns",
  category: "layout",
  // selfSeam so `display:flex` + `gap` land on the row itself, making the
  // columns its direct flex items.
  selfSeam: true,
  inputs: [
    {
      name: "stackAt",
      type: "select",
      label: "Stack columns at",
      options: [
        { label: "Tablet", value: "tablet" },
        { label: "Mobile", value: "mobile" },
        { label: "Never", value: "never" },
      ],
    },
    {
      name: "reverseWhenStacked",
      type: "boolean",
      label: "Reverse when stacked",
    },
    {
      name: "columns",
      type: "slot",
      label: "Columns",
      allowedBlocks: ["core/column"],
      defaultChildren: DEFAULT_COLUMNS,
    },
  ],
  // Seeds the inspector control; keep in sync with pickStackAt's render default.
  defaults: { stackAt: "tablet" },
  // A flex row with a gap. Responsive stacking rides a scoped media query keyed
  // off `stackAt` (see render), not a seeded bucket, so the preset owns it.
  defaultStyles: {
    large: { display: "flex", gap: "20px", alignItems: "stretch" },
  },
  render: ({ attrs, blockProps, nodeId, breakpoints }): ReactNode => {
    const Columns = attrs.columns as (() => ReactNode) | undefined;
    const stackCss = nodeId
      ? stackStyleCss(
          nodeId,
          pickStackAt(attrs.stackAt),
          attrs.reverseWhenStacked === true,
          breakpoints ?? DEFAULT_BREAKPOINTS,
        )
      : "";
    // A dedicated scoping class the stacking `<style>` targets — always present
    // (unlike the style-slot class, which a user could clear).
    const className =
      [blockProps.className, nodeId ? `plumix-cols-${nodeId}` : null]
        .filter(Boolean)
        .join(" ") || undefined;
    return (
      <div {...blockProps} className={className}>
        {stackCss ? <style>{stackCss}</style> : null}
        {Columns ? <Columns /> : null}
      </div>
    );
  },
});
