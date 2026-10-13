import type { Editor, Range } from "@tiptap/core";
import { getMarkAttributes, getMarkRange, getMarkType } from "@tiptap/core";

type EditorState = Editor["state"];
type Transaction = EditorState["tr"];

/** An edit of the link over a range the popover snapshotted. */
export type LinkChange = (state: EditorState, range: Range) => Transaction;

/** The href of the link at the selection, or `""` outside one. */
export function linkHrefAt(state: EditorState): string {
  return (getMarkAttributes(state, "link").href as string | undefined) ?? "";
}

/** A range inside one link widens to all of it, so a caret edits the link. */
function linkRange(state: EditorState, range: Range): Range {
  const type = getMarkType("link", state.schema);
  const link = getMarkRange(state.doc.resolve(range.from), type);
  return link && link.from <= range.from && link.to >= range.to ? link : range;
}

/**
 * Links `range` to `href`, keeping the other attributes of a link it edits. An
 * empty `href` removes the link.
 */
export function applyLink(
  state: EditorState,
  range: Range,
  href: string,
): Transaction {
  if (!href) return removeLink(state, range);
  const type = getMarkType("link", state.schema);
  const { from, to } = linkRange(state, range);
  const { tr } = state;
  if (from === to) return tr.addStoredMark(type.create({ href }));
  state.doc.nodesBetween(from, to, (node, pos) => {
    const existing = node.marks.find((mark) => mark.type === type);
    tr.addMark(
      Math.max(pos, from),
      Math.min(pos + node.nodeSize, to),
      type.create({ ...existing?.attrs, href }),
    );
  });
  return tr;
}

export function removeLink(state: EditorState, range: Range): Transaction {
  const type = getMarkType("link", state.schema);
  const { from, to } = linkRange(state, range);
  return state.tr.removeMark(from, to, type).removeStoredMark(type);
}
