import type { ReactElement } from "react";
import { Mark, mergeAttributes } from "@tiptap/core";

import type { MarkComponent, MarkProps } from "../types.js";
import { defineMark } from "../define-mark.js";

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

const AbbrComponent: MarkComponent = ({
  attrs,
  children,
}: MarkProps): ReactElement => {
  const title =
    typeof attrs.title === "string" && attrs.title.length > 0
      ? attrs.title
      : undefined;
  return <abbr title={title}>{children}</abbr>;
};
AbbrComponent.displayName = "abbr-mark";

export const abbrMark = defineMark({
  name: "abbr",
  title: "Abbreviation",
  description: "Abbreviation with an optional tooltip via the title attr.",
  bubbleMenuIcon: "WholeWord",
  schema: () => Promise.resolve(abbrSchema),
  component: () => Promise.resolve(AbbrComponent),
});
