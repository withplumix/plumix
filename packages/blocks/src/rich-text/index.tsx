import type { ReactNode } from "react";
import { isValidElement } from "react";

import type { BlockNodeRenderProps } from "../render-block-tree.js";
import { defineBlock } from "../block-registry.js";
import { useHtmlAllowlist } from "../html/context.js";
import { sanitizeHtml } from "../html/sanitize.js";
import { expandShortcodes } from "../shortcodes/expand.js";

// The trust boundary is the stored bytes: a string body is authored HTML and
// is sanitised at render like `core/html`, which also covers content stored
// before this gate. A React-element body is the editor's own live buffer
// (admin editor preview), so it surfaces verbatim.
function RichTextBlockRender({
  attrs,
  context,
}: BlockNodeRenderProps): ReactNode {
  const allowlist = useHtmlAllowlist();
  if (isValidElement(attrs.body)) return attrs.body;
  if (typeof attrs.body !== "string") return <div />;
  // Shortcode output is escaped, so a single sanitise over the expansion
  // covers both the body and the expanded result.
  const expanded = context.shortcodes
    ? expandShortcodes(attrs.body, context.shortcodes, {
        siteSettings: context.siteSettings,
        locale: context.locale,
        entry: context.entry,
      })
    : attrs.body;
  return (
    <div
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(expanded, allowlist) }}
    />
  );
}

export const richTextBlock = defineBlock({
  name: "core/rich-text",
  title: { id: "block.core.rich-text.title", message: "Rich text" },
  icon: "Type",
  category: "text",
  // Authors still mentally call this "paragraph" — the slash menu's
  // title/keywords/name matcher needs an explicit hook so typing
  // `/paragraph` finds rich-text after the legacy paragraph block was
  // removed in #473.
  keywords: [
    { id: "block.core.rich-text.keyword.paragraph", message: "paragraph" },
    { id: "block.core.rich-text.keyword.text", message: "text" },
    { id: "block.core.rich-text.keyword.body", message: "body" },
  ],
  inputs: [
    {
      name: "body",
      type: "richtext",
      label: { id: "block.core.rich-text.input.body.label", message: "Body" },
    },
  ],
  defaults: { body: "<p>Enter text here…</p>" },
  render: RichTextBlockRender,
});
