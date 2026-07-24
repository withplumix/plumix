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
 * Which marks / block nodes an editor instance admits. Mirrors the meta
 * `richtext()` field's `.marks()` / `.nodes()` allowlists (and the
 * server's constraint walker), so a constrained field's editor can only
 * ever produce content the server would accept. An omitted axis denies
 * everything on that axis; passing no options object at all admits the
 * full set (the block editor's behavior).
 */
export interface RichTextExtensionOptions {
  /** Allowed inline mark names (`bold`, `link`, …). Omitted = deny all marks. */
  readonly marks?: readonly string[];
  /** Allowed block node names (`heading`, `bulletList`, …). Omitted = paragraphs only. */
  readonly nodes?: readonly string[];
}

/** Whether `name` is an admitted mark. No allowlist ⇒ everything is admitted. */
export function allowsMark(
  options: RichTextExtensionOptions | undefined,
  name: string,
): boolean {
  return options === undefined
    ? true
    : (options.marks?.includes(name) ?? false);
}

/** Whether `name` is an admitted block node. No allowlist ⇒ everything is admitted. */
export function allowsNode(
  options: RichTextExtensionOptions | undefined,
  name: string,
): boolean {
  return options === undefined
    ? true
    : (options.nodes?.includes(name) ?? false);
}

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
 *
 * Pass {@link RichTextExtensionOptions} to constrain the schema to a meta
 * field's allowlist — the block-level nodes and marks outside the list are
 * dropped from the editor entirely (not just hidden), so they can't be
 * produced. Called with no argument the set is unchanged.
 */
export function richTextExtensions(
  options?: RichTextExtensionOptions,
): Extensions {
  // Schema essentials + editing affordances that carry no content of their
  // own (history, cursors, keymaps) are always present. Order matches the
  // historical full set so the block editor's schema is byte-for-byte the
  // same when called argument-free.
  const extensions: Extensions = [Document, Paragraph, Text];

  if (allowsNode(options, "heading")) {
    extensions.push(Heading.configure({ levels: [...HEADING_LEVELS] }));
  }
  if (allowsNode(options, "blockquote")) {
    extensions.push(Blockquote);
  }
  extensions.push(HardBreak);
  if (allowsNode(options, "bulletList")) {
    extensions.push(BulletList);
  }
  if (allowsNode(options, "orderedList")) {
    extensions.push(OrderedList);
  }
  // A list node is nothing without its item + the keymap that makes
  // Enter/Tab behave; pull them in whenever either list is admitted.
  if (allowsNode(options, "bulletList") || allowsNode(options, "orderedList")) {
    extensions.push(ListItem, ListKeymap);
  }
  extensions.push(UndoRedo, Dropcursor, Gapcursor, TrailingNode);
  extensions.push(
    ...coreMarkExtensions.filter((mark) => allowsMark(options, mark.name)),
  );
  return extensions;
}
