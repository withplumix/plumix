import { Mark, mergeAttributes } from "@tiptap/core";

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
