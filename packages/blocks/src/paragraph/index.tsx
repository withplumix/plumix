import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { renderInline } from "../marks/render-inline.js";

export const paragraphBlock = defineBlock({
  name: "core/paragraph",
  title: "Paragraph",
  icon: "Paragraph",
  category: "text",
  inputs: [{ name: "body", type: "richtext", label: "Body" }],
  // ProseMirror's `doc` requires at least one block child; an empty
  // paragraph keeps the editor mountable on first focus.
  defaults: { body: { type: "doc", content: [{ type: "paragraph" }] } },
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
  // Always emit a `<p>`. The first-paragraph inline run lives inside;
  // multi-paragraph docs surface a single block but only the first run
  // renders (Enter splits into a new paragraph block at the editor
  // level, not a paragraph node inside one block).
  render: ({ attrs }): ReactNode => {
    if (typeof attrs.body === "object" && attrs.body !== null) {
      return <p>{renderInline(attrs.body)}</p>;
    }
    // Legacy plain-string content (pre-richtext entries, nested-slot
    // test fixtures). Drops once existing entries + fixtures move to
    // the doc shape.
    if (typeof attrs.text === "string") return <p>{attrs.text}</p>;
    return <p />;
  },
});
