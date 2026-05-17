import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";
import { sanitizeHtml } from "./sanitize.js";

export function HtmlComponent({ attrs }: BlockProps): ReactElement {
  return (
    <div
      data-plumix-block="core/html"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(attrs.html) }}
    />
  );
}
