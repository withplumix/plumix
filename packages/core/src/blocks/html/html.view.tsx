import type { ReactNode } from "react";

import type { BlockViewProps } from "../render-block-tree.js";
import { useHtmlAllowlist } from "./context.js";
import { sanitizeHtml } from "./sanitize.js";

/** Imports the sanitizer, so it loads only when an HTML block renders. */
export default function HtmlView({ attrs }: BlockViewProps): ReactNode {
  const allowlist = useHtmlAllowlist();
  const raw = (attrs.html as string | undefined) ?? "";
  return (
    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw, allowlist) }} />
  );
}
