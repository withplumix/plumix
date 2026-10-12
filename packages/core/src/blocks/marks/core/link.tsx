import { Mark, mergeAttributes } from "@tiptap/core";

import { sanitizeHref } from "../safe-href.js";

export const linkSchema = Mark.create({
  name: "link",
  inclusive: false,

  addAttributes() {
    return {
      href: { default: null },
      target: { default: null },
      rel: { default: "noopener noreferrer nofollow" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[href]",
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const href = sanitizeHref(node.getAttribute("href"));
          if (!href) return false;
          const target = node.getAttribute("target");
          return {
            href,
            target: target === "_blank" ? "_blank" : null,
            rel: "noopener noreferrer nofollow",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Clamp on render too: an attr written directly via `setAttr` bypasses
    // `parseHTML`'s gate.
    const href = sanitizeHref(HTMLAttributes.href);
    if (!href) return ["span", {}, 0];
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        href,
        rel: "noopener noreferrer nofollow",
        target: HTMLAttributes.target === "_blank" ? "_blank" : null,
      }),
      0,
    ];
  },
});
