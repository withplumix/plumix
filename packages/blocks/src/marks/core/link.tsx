import { Mark, mergeAttributes } from "@tiptap/core";

import type { MarkSpec } from "../types.js";

// Same allowlist `renderInline` uses; kept in sync deliberately so a
// pasted `javascript:` URL never reaches the editor doc.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}

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

export const linkMark: MarkSpec = {
  name: "link",
  title: "Link",
  description: "Inline hyperlink with safe-href filtering.",
  bubbleMenuIcon: "Link",
  schema: linkSchema,
};
