import type { ReactElement } from "react";
import { Mark, mergeAttributes } from "@tiptap/core";

import type { MarkComponent, MarkProps } from "../types.js";
import { defineMark } from "../define-mark.js";

// Same allowlist the walker's link-mark fallback uses, kept in sync
// deliberately so `link` content rendered through the registry
// matches the legacy code path's safety guarantees.
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
    // Sanitize at parse time so a pasted javascript:/vbscript:/data:
    // URL never enters the editor doc. Returning `false` from
    // `getAttrs` rejects the match entirely.
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
    // Clamp on render too: an attr written directly via `setAttr` can
    // bypass `parseHTML`'s gate. Schema is the single source of truth.
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

const LinkComponent: MarkComponent = ({
  attrs,
  children,
}: MarkProps): ReactElement | null => {
  const href = sanitizeHref(attrs.href);
  if (href === undefined) {
    // Returning `children` (rather than `<a>` with no href) keeps text
    // legible when the editor pastes content carrying an unsafe scheme.
    return children as ReactElement | null;
  }
  // `rel` is always hardcoded — never trust attrs.rel, since a pasted
  // `rel=""` or `rel="opener"` would strip the noreferrer/nofollow safety
  // the schema's default claims. Same reason `target` is clamped: only
  // explicit `_blank` is honored, anything else is dropped.
  const target = attrs.target === "_blank" ? "_blank" : undefined;
  return (
    <a href={href} target={target} rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
};
LinkComponent.displayName = "link-mark";

export const linkMark = defineMark({
  name: "link",
  title: "Link",
  description: "Inline hyperlink with safe-href filtering.",
  bubbleMenuIcon: "Link",
  schema: () => Promise.resolve(linkSchema),
  component: () => Promise.resolve(LinkComponent),
});
