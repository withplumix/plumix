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

import { coreMarkExtensions, HEADING_LEVELS } from "@plumix/core/blocks";

/**
 * An omitted axis denies everything on it; omitting the whole object admits the
 * full set.
 */
export interface RichTextExtensionOptions {
  /**
   * Allowed inline mark names (`bold`, `link`, …). Omitted = deny all marks.
   */
  readonly marks?: readonly string[];
  /**
   * Allowed block node names (`heading`, `bulletList`, …). Omitted = paragraphs
   * only.
   */
  readonly nodes?: readonly string[];
}

/**
 * Whether `name` is an admitted mark. No allowlist ⇒ everything is admitted.
 */
export function allowsMark(
  options: RichTextExtensionOptions | undefined,
  name: string,
): boolean {
  return options === undefined
    ? true
    : (options.marks?.includes(name) ?? false);
}

/**
 * Whether `name` is an admitted block node. No allowlist ⇒ everything is
 * admitted.
 */
export function allowsNode(
  options: RichTextExtensionOptions | undefined,
  name: string,
): boolean {
  return options === undefined
    ? true
    : (options.nodes?.includes(name) ?? false);
}

/**
 * Explicit list, not StarterKit: `configure({ bold: false })` disables but
 * still bundles an extension. Disallowed nodes and marks are dropped from the
 * schema, not hidden.
 */
export function richTextExtensions(
  options?: RichTextExtensionOptions,
): Extensions {
  // Order keeps the argument-free schema byte-for-byte stable.
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
