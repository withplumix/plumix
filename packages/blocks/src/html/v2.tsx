import type { BlockNodeRenderProps } from "../render-block-tree.js";
import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { useHtmlAllowlist } from "./context.js";
import { sanitizeHtml } from "./sanitize.js";

function HtmlBlockV2Render({ attrs }: BlockNodeRenderProps): ReactNode {
  const allowlist = useHtmlAllowlist();
  const raw = (attrs.html as string | undefined) ?? "";
  return (
    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(raw, allowlist) }} />
  );
}

export const htmlBlockV2 = defineBlock({
  name: "core/html",
  title: "HTML",
  icon: "Code",
  category: "interactive",
  inputs: [{ name: "html", type: "textarea", label: "HTML" }],
  defaults: { html: "" },
  render: HtmlBlockV2Render,
});
