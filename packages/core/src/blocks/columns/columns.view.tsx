import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";
import type { ThemeBreakpoints } from "../styles/style-emitter.js";
import { DEFAULT_BREAKPOINTS } from "../styles/style-emitter.js";

const STACK_AT = ["tablet", "mobile", "never"] as const;
type StackAt = (typeof STACK_AT)[number];
const DEFAULT_STACK_AT: StackAt = "tablet";

function pickStackAt(raw: unknown): StackAt {
  return typeof raw === "string" &&
    (STACK_AT as readonly string[]).includes(raw)
    ? (raw as StackAt)
    : DEFAULT_STACK_AT;
}

/**
 * Emitted by the block rather than a stylesheet so it follows the theme's
 * breakpoints.
 */
function stackStyleCss(
  nodeId: string,
  stackAt: StackAt,
  reverse: boolean,
  breakpoints: ThemeBreakpoints,
): string {
  if (stackAt === "never") return "";
  const max = stackAt === "mobile" ? breakpoints.mobile : breakpoints.tablet;
  const direction = reverse ? "column-reverse" : "column";
  return `@media (max-width: ${max}px) { .plumix-cols-${nodeId} { flex-direction: ${direction}; } }`;
}

export default function ColumnsView({
  attrs,
  blockProps,
  nodeId,
  breakpoints,
}: BlockViewProps): ReactNode {
  const Columns = attrs.columns as (() => ReactNode) | undefined;
  const stackCss = nodeId
    ? stackStyleCss(
        nodeId,
        pickStackAt(attrs.stackAt),
        attrs.reverseWhenStacked === true,
        breakpoints ?? DEFAULT_BREAKPOINTS,
      )
    : "";
  // The stacking `<style>` can't target the style-slot class: a user can clear it.
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
}
