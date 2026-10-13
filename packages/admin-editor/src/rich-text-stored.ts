import type { JSONContent } from "@tiptap/react";

const EMPTY_PARAGRAPH = "<p></p>";

/**
 * The trailing-node extension's empty paragraph is the editor's, not the
 * author's. The sync guard compares this same form, or every keystroke resets
 * the editor.
 */
export function storedHtml(html: string): string {
  return html !== EMPTY_PARAGRAPH && html.endsWith(EMPTY_PARAGRAPH)
    ? html.slice(0, -EMPTY_PARAGRAPH.length)
    : html;
}

export function storedJson(doc: JSONContent): JSONContent {
  const nodes = doc.content ?? [];
  const last = nodes.at(-1);
  return nodes.length > 1 && last?.type === "paragraph" && !last.content
    ? { ...doc, content: nodes.slice(0, -1) }
    : doc;
}

/**
 * `current` is the editor's raw HTML or JSON. Relies on the host storing back
 * the exact value emitted: a re-serialized `value` resets the caret mid-type.
 */
export function contentNeedsReset(
  serialization: "html" | "json",
  value: string | JSONContent | null,
  current: string | JSONContent,
  isEmpty: boolean,
): boolean {
  if (serialization === "html") {
    return typeof current === "string" && value !== storedHtml(current);
  }
  if (value == null) return !isEmpty;
  return (
    typeof current !== "string" &&
    JSON.stringify(value) !== JSON.stringify(storedJson(current))
  );
}
