import type { MarkSpec } from "../types.js";

/**
 * In bubble-menu order. Tiptap-free so reading the catalogue never drags the
 * editor's ProseMirror graph into the worker bundle.
 */
export const coreMarks: readonly MarkSpec[] = Object.freeze([
  {
    name: "bold",
    title: "Bold",
    keyboardShortcut: "Mod-b",
    bubbleMenuIcon: "Bold",
  },
  {
    name: "italic",
    title: "Italic",
    keyboardShortcut: "Mod-i",
    bubbleMenuIcon: "Italic",
  },
  {
    name: "strike",
    title: "Strikethrough",
    keyboardShortcut: "Mod-Shift-X",
    bubbleMenuIcon: "Strikethrough",
  },
  {
    name: "code",
    title: "Inline code",
    keyboardShortcut: "Mod-e",
    bubbleMenuIcon: "Code",
  },
  {
    name: "link",
    title: "Link",
    description: "Inline hyperlink with safe-href filtering.",
    bubbleMenuIcon: "Link",
  },
  {
    name: "underline",
    title: "Underline",
    keyboardShortcut: "Mod-u",
    bubbleMenuIcon: "Underline",
  },
  { name: "subscript", title: "Subscript", bubbleMenuIcon: "Subscript" },
  { name: "superscript", title: "Superscript", bubbleMenuIcon: "Superscript" },
  { name: "highlight", title: "Highlight", bubbleMenuIcon: "Highlighter" },
  { name: "kbd", title: "Keyboard", bubbleMenuIcon: "Keyboard" },
  {
    name: "abbr",
    title: "Abbreviation",
    description: "Abbreviation with an optional tooltip via the title attr.",
    bubbleMenuIcon: "WholeWord",
  },
  { name: "cite", title: "Citation", bubbleMenuIcon: "Quote" },
  { name: "small", title: "Small print", bubbleMenuIcon: "TextQuote" },
]);
