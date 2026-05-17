import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";
import { useHtmlAllowlist } from "./context.js";
import { sanitizeHtml } from "./sanitize.js";

export function HtmlComponent({ attrs }: BlockProps): ReactElement {
  const allowlist = useHtmlAllowlist();
  return (
    <div
      data-plumix-block="core/html"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(attrs.html, allowlist) }}
    />
  );
}
