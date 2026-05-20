import type { Mark } from "@tiptap/core";

import type { MarkSpec } from "../types.js";
import { abbrMark, abbrSchema } from "./abbr.js";
import { linkMark, linkSchema } from "./link.js";
import { createSimpleMarkExtension, simpleMark } from "./simple.js";
import { SIMPLE_MARK_CONFIGS } from "./simple-configs.js";

/**
 * The 13 canonical inline marks shipped by `@plumix/blocks`. Order is
 * the conventional bubble-menu ordering: text-format marks first, then
 * link, then specialised semantic marks.
 */
export const coreMarks: readonly MarkSpec[] = Object.freeze([
  simpleMark({
    name: "bold",
    title: "Bold",
    tag: "strong",
    parseTags: ["strong", "b"],
    keyboardShortcut: "Mod-b",
    bubbleMenuIcon: "Bold",
  }),
  simpleMark({
    name: "italic",
    title: "Italic",
    tag: "em",
    parseTags: ["em", "i"],
    keyboardShortcut: "Mod-i",
    bubbleMenuIcon: "Italic",
  }),
  simpleMark({
    name: "strike",
    title: "Strikethrough",
    tag: "s",
    parseTags: ["s", "del", "strike"],
    keyboardShortcut: "Mod-Shift-X",
    bubbleMenuIcon: "Strikethrough",
  }),
  simpleMark({
    name: "code",
    title: "Inline code",
    tag: "code",
    parseTags: ["code"],
    keyboardShortcut: "Mod-e",
    bubbleMenuIcon: "Code",
  }),
  linkMark,
  simpleMark({
    name: "underline",
    title: "Underline",
    tag: "u",
    parseTags: ["u"],
    keyboardShortcut: "Mod-u",
    bubbleMenuIcon: "Underline",
  }),
  simpleMark({
    name: "subscript",
    title: "Subscript",
    tag: "sub",
    parseTags: ["sub"],
    bubbleMenuIcon: "Subscript",
  }),
  simpleMark({
    name: "superscript",
    title: "Superscript",
    tag: "sup",
    parseTags: ["sup"],
    bubbleMenuIcon: "Superscript",
  }),
  simpleMark({
    name: "highlight",
    title: "Highlight",
    tag: "mark",
    parseTags: ["mark"],
    bubbleMenuIcon: "Highlighter",
  }),
  simpleMark({
    name: "kbd",
    title: "Keyboard",
    tag: "kbd",
    parseTags: ["kbd"],
    bubbleMenuIcon: "Keyboard",
  }),
  abbrMark,
  simpleMark({
    name: "cite",
    title: "Citation",
    tag: "cite",
    parseTags: ["cite"],
    bubbleMenuIcon: "Quote",
  }),
  simpleMark({
    name: "small",
    title: "Small print",
    tag: "small",
    parseTags: ["small"],
    bubbleMenuIcon: "TextQuote",
  }),
]);

// Sync projection consumed by Puck's richtext field config; the
// MarkSpec's LazyRef wrapping isn't usable at module-load.
export const coreMarkExtensions: readonly Mark[] = Object.freeze([
  ...SIMPLE_MARK_CONFIGS.map((cfg) => createSimpleMarkExtension(cfg)),
  linkSchema,
  abbrSchema,
]);
