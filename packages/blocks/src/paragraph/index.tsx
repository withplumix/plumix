import type { ReactNode } from "react";
import { isValidElement } from "react";

import { defineBlock } from "../block-registry.js";

export const paragraphBlock = defineBlock({
  name: "core/paragraph",
  title: "Paragraph",
  icon: "Paragraph",
  category: "text",
  inputs: [{ name: "body", type: "richtext", label: "Body" }],
  defaults: { body: "<p></p>" },
  transforms: {
    priority: 50,
    to: [
      { target: "core/heading", mapAttrs: (a) => ({ level: 2, body: a.body }) },
      {
        target: "core/quote",
        mapAttrs: (a) => ({ body: a.body, citation: "" }),
      },
    ],
  },
  // Puck's richtext field stores HTML strings (see apps/demo/config/
  // blocks/RichText). The admin canvas hands `attrs.body` wrapped as a
  // <RichTextRender> React element; SSR / walker callers see the raw
  // string. TODO(#XXX): sanitize the HTML at the entry.update ingest —
  // the trust boundary is the stored bytes, not the editor.
  render: ({ attrs }): ReactNode => {
    if (isValidElement(attrs.body)) return attrs.body;
    if (typeof attrs.body === "string") {
      return <div dangerouslySetInnerHTML={{ __html: attrs.body }} />;
    }
    if (typeof attrs.text === "string") return <p>{attrs.text}</p>;
    return <p />;
  },
});
