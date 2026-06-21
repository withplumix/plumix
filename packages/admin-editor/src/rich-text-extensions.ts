import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { coreMarkExtensions } from "@plumix/blocks";

// The render sanitizer only permits h2–h4, so the editor must not produce other
// heading levels. Gates both the schema and the toolbar's heading buttons.
export const HEADING_LEVELS = [2, 3, 4] as const;

/**
 * Tiptap extensions for the rich-text rail: StarterKit's block nodes
 * (paragraph, heading, lists, …) plus `@plumix/blocks`' 13 canonical marks.
 * StarterKit's own marks are disabled so they don't double-register with the
 * shared core marks — the editor and the renderer then speak the same mark
 * vocabulary.
 */
export function richTextExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
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
