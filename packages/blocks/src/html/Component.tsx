import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

/**
 * SECURITY TODO (issue #312): the raw `html` attribute is passed
 * through `dangerouslySetInnerHTML` verbatim today. That is acceptable
 * only because slice #305 ships this block behind the same trust
 * boundary the legacy walker had — author content. Slice #312 wires
 * DOMPurify with an operator-configurable allowlist; until then,
 * surfaces that accept unauthenticated submissions MUST NOT enable
 * `core/html` in their field allowlist.
 */
export function HtmlComponent({ attrs }: BlockProps): ReactElement {
  const raw = typeof attrs.html === "string" ? attrs.html : "";
  return (
    <div
      data-plumix-block="core/html"
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  );
}
