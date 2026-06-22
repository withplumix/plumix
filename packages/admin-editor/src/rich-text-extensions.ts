import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { coreMarkExtensions } from "@plumix/blocks";

/**
 * Tiptap extensions for the rich-text rail: StarterKit's block nodes
 * (paragraph, lists, …) plus `@plumix/blocks`' 13 canonical marks. Headings are
 * disabled — structural headings are the dedicated Heading block, so rich text
 * stays prose-only. StarterKit's own marks are disabled so they don't
 * double-register with the shared core marks — the editor and the renderer then
 * speak the same mark vocabulary.
 */
export function richTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      link: false,
      underline: false,
    }),
    ...coreMarkExtensions,
  ];
}
