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

const linkSchema = Mark.create({
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
    return [{ tag: "a[href]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes), 0];
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
  schema: () => Promise.resolve(linkSchema),
  component: () => Promise.resolve(LinkComponent),
});
