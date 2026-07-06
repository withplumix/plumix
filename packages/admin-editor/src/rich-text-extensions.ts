import type { Extensions } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import {
  BulletList,
  ListItem,
  ListKeymap,
  OrderedList,
} from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import {
  Dropcursor,
  Gapcursor,
  TrailingNode,
  UndoRedo,
} from "@tiptap/extensions";

import { coreMarkExtensions, HEADING_LEVELS } from "@plumix/blocks";

/**
 * Tiptap extensions for the rich-text rail. We import the exact set the body
 * uses instead of `@tiptap/starter-kit`: StarterKit bundles ~16 extensions but
 * we activated only these — the rest were either marks we replace with
 * `@plumix/blocks`' shared marks (bold/italic/…) or nodes that are standalone
 * blocks (code, separator). `configure({ bold: false })` would disable but
 * still bundle them, so the explicit list is what actually drops them from the
 * editor chunk.
 *
 * Kept (the set StarterKit had active here): document/paragraph/text (schema),
 * headings (h1–h6) + blockquote (folded in from the former Heading and Quote
 * blocks so rich text is a single Notion-style Text block), hard break
 * (shift-enter), bullet + ordered lists (toolbar buttons) with list-item +
 * keymap, undo/redo (in-field history — the host toolbar bails inside
 * contenteditable, so the field owns its own), drop/gap cursors, and the
 * trailing node (keeps an empty paragraph after a trailing list so the caret
 * can escape it). Marks come from `coreMarkExtensions` so the editor and
 * renderer share one vocabulary.
 *
 * Heading levels come from the shared `HEADING_LEVELS` (h1–h6), the single
 * source of truth the sanitiser allowlist also derives from.
 */
export function richTextExtensions(): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [...HEADING_LEVELS] }),
    Blockquote,
    HardBreak,
    BulletList,
    OrderedList,
    ListItem,
    ListKeymap,
    UndoRedo,
    Dropcursor,
    Gapcursor,
    TrailingNode,
    ...coreMarkExtensions,
  ];
}
