import { Mark, mergeAttributes } from "@tiptap/core";

import type { MarkSpec } from "../types.js";

export const abbrSchema = Mark.create({
  name: "abbr",
  addAttributes() {
    return { title: { default: null } };
  },
  parseHTML() {
    return [{ tag: "abbr" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["abbr", mergeAttributes(HTMLAttributes), 0];
  },
});

export const abbrMark: MarkSpec = {
  name: "abbr",
  title: "Abbreviation",
  description: "Abbreviation with an optional tooltip via the title attr.",
  bubbleMenuIcon: "WholeWord",
  schema: abbrSchema,
};
