import type { ReactElement } from "react";

import type { BlockStyleSlot } from "../styles/types.js";
import type { BlockProps } from "../types.js";
import { blockElementProps, useBlockStyles } from "../styles/hooks.js";
import { paragraphSupports } from "./supports.js";

/**
 * Default frontend rendering for `core/paragraph`.
 *
 * Themes override by supplying a different component via
 * `defineTheme({ blocks: { "core/paragraph": MyParagraph } })`.
 */
export function ParagraphComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const slot = (attrs.style ?? {}) as BlockStyleSlot;
  const resolved = useBlockStyles(slot, paragraphSupports);
  return (
    <p
      {...blockElementProps(resolved, {
        name: "core/paragraph",
        moduleClass: "plumix-paragraph",
      })}
    >
      {children}
    </p>
  );
}
