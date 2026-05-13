import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// `undefined` allowlist → canvas mode (full StarterKit). Defined →
// strict richtext-field mode where StarterKit extensions are gated
// by the field's `marks` / `nodes`.
//
// `blocks` is a forward-compatible allowlist of node names — the
// server-side validator accepts them, but they're not yet auto-
// instantiated as Tiptap extensions. The theme-side block render
// registry covers that integration. Plugins needing editor-side
// rendering today use `registerPluginFieldType` instead.

interface RichtextAllowlistInput {
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

// Per-call object literal: Tiptap's `LinkOptions` requires mutable
// arrays, so a top-level `as const` would clash with its types.
function linkOptions() {
  return {
    openOnClick: false,
    protocols: ["http", "https", "mailto"],
    HTMLAttributes: {
      rel: "noopener noreferrer nofollow",
      target: "_blank",
    },
  };
}

export function buildTiptapExtensions(
  allowlist?: RichtextAllowlistInput,
): Extensions {
  if (allowlist === undefined) {
    return [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: linkOptions(),
      }),
    ];
  }
  const marks = new Set(allowlist.marks ?? []);
  const nodes = new Set(allowlist.nodes ?? []);
  return [
    StarterKit.configure({
      bold: marks.has("bold") ? {} : false,
      italic: marks.has("italic") ? {} : false,
      strike: marks.has("strike") ? {} : false,
      code: marks.has("code") ? {} : false,
      link: marks.has("link") ? linkOptions() : false,
      // `paragraph`, `text`, `doc` are baseline (ProseMirror requires them).
      heading: nodes.has("heading") ? { levels: [2, 3] } : false,
      bulletList: nodes.has("bulletList") ? {} : false,
      orderedList: nodes.has("orderedList") ? {} : false,
      listItem:
        nodes.has("bulletList") || nodes.has("orderedList") ? {} : false,
      blockquote: nodes.has("blockquote") ? {} : false,
      codeBlock: nodes.has("codeBlock") ? {} : false,
      horizontalRule: nodes.has("horizontalRule") ? {} : false,
      hardBreak: nodes.has("hardBreak") ? {} : false,
    }),
  ];
}
