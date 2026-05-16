import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

/**
 * Default frontend rendering for `core/paragraph`.
 *
 * Themes override by supplying a different component via
 * `defineTheme({ blocks: { "core/paragraph": MyParagraph } })`.
 */
export function ParagraphComponent({ children }: BlockProps): ReactElement {
  return <p>{children}</p>;
}
