import type { ReactNode } from "react";
import { isValidElement } from "react";

import { defineBlock } from "../block-registry.js";

export const richTextBlock = defineBlock({
  name: "core/rich-text",
  title: "Rich text",
  icon: "Type",
  category: "text",
  inputs: [{ name: "body", type: "richtext", label: "Body" }],
  defaults: { body: "<p></p>" },
  // Mirrors `paragraph/index.tsx` — admin Puck preview hands `attrs.body`
  // wrapped as a <RichTextRender> React element, SSR / walker callers see
  // the raw HTML string. TODO(#XXX): sanitize the HTML at the
  // entry.update ingest — the trust boundary is the stored bytes, not
  // the editor.
  render: ({ attrs }): ReactNode => {
    if (isValidElement(attrs.body)) return attrs.body;
    if (typeof attrs.body === "string") {
      return <div dangerouslySetInnerHTML={{ __html: attrs.body }} />;
    }
    return <div />;
  },
});
