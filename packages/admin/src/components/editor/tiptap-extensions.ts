import type { Extensions } from "@tiptap/react";
import { HtmlBadgeNodeView } from "@/editor/unknown-block/HtmlBadgeNodeView.js";
import { UnknownBlockNodeView } from "@/editor/unknown-block/UnknownBlockNodeView.js";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import type { BlockRegistry } from "@plumix/blocks";
import { unknownBlockSchema } from "@plumix/blocks";

import { wireBlockSpecExtension } from "./spec-extensions.js";

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

interface BuildExtensionsInput {
  readonly allowlist?: RichtextAllowlistInput;
  /**
   * Canvas-mode-only. When supplied, every block's resolved Tiptap
   * Node is appended to the extension list so the slash menu can
   * insert namespaced types (`core/quote`, `core/code`, …) without
   * ProseMirror throwing "unknown node type".
   */
  readonly blockRegistry?: BlockRegistry;
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
  input: BuildExtensionsInput = {},
): Extensions {
  const { allowlist, blockRegistry } = input;
  if (allowlist === undefined) {
    return [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: linkOptions(),
      }),
      ...registryNodeExtensions(blockRegistry),
      unknownBlockSchema.extend({
        addNodeView() {
          return ReactNodeViewRenderer(UnknownBlockNodeView);
        },
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

function registryNodeExtensions(
  registry: BlockRegistry | undefined,
): Extensions {
  if (!registry) return [];
  const exts: Extensions = [];
  for (const [, spec] of registry) {
    const wired = wireBlockSpecExtension(spec);
    if (spec.name === "core/html") {
      exts.push(
        wired.extend({
          addNodeView() {
            return ReactNodeViewRenderer(HtmlBadgeNodeView);
          },
        }),
      );
      continue;
    }
    exts.push(wired);
  }
  return exts;
}
