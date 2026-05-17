import type { MarkSpec } from "../types.js";
import { abbrMark } from "./abbr.js";
import { linkMark } from "./link.js";
import { simpleMark } from "./simple.js";

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
  }),
  simpleMark({
    name: "italic",
    title: "Italic",
    tag: "em",
    parseTags: ["em", "i"],
    keyboardShortcut: "Mod-i",
  }),
  simpleMark({
    name: "strike",
    title: "Strikethrough",
    tag: "s",
    parseTags: ["s", "del", "strike"],
    keyboardShortcut: "Mod-Shift-X",
  }),
  simpleMark({
    name: "code",
    title: "Inline code",
    tag: "code",
    parseTags: ["code"],
    keyboardShortcut: "Mod-e",
  }),
  linkMark,
  simpleMark({
    name: "underline",
    title: "Underline",
    tag: "u",
    parseTags: ["u"],
    keyboardShortcut: "Mod-u",
  }),
  simpleMark({
    name: "subscript",
    title: "Subscript",
    tag: "sub",
    parseTags: ["sub"],
  }),
  simpleMark({
    name: "superscript",
    title: "Superscript",
    tag: "sup",
    parseTags: ["sup"],
  }),
  simpleMark({
    name: "highlight",
    title: "Highlight",
    tag: "mark",
    parseTags: ["mark"],
  }),
  simpleMark({
    name: "kbd",
    title: "Keyboard",
    tag: "kbd",
    parseTags: ["kbd"],
  }),
  abbrMark,
  simpleMark({
    name: "cite",
    title: "Citation",
    tag: "cite",
    parseTags: ["cite"],
  }),
  simpleMark({
    name: "small",
    title: "Small print",
    tag: "small",
    parseTags: ["small"],
  }),
]);
