import type { ReactNode } from "react";

import { defineBlock } from "../block-registry.js";
import { renderInlineAll } from "../marks/render-inline.js";

export const paragraphBlockV2 = defineBlock({
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
  render: ({ attrs }): ReactNode => {
    if (typeof attrs.body === "object" && attrs.body !== null) {
      return <>{renderInlineAll(attrs.body)}</>;
    }
    // Legacy plain-string content; drops at cutover (#405) once
    // existing entries + fixtures move to the richtext doc shape.
    if (typeof attrs.text === "string") return <p>{attrs.text}</p>;
    return null;
  },
});
