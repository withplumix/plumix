import type { JSX, ReactNode } from "react";
import { createElement } from "react";

import { SIMPLE_MARK_TAGS } from "./core/simple-configs.js";

interface TiptapMark {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

interface TiptapTextNode {
  readonly type: "text";
  readonly text: string;
  readonly marks?: readonly TiptapMark[];
}

interface TiptapBlockNode {
  readonly type: string;
  readonly content?: readonly (TiptapTextNode | TiptapBlockNode)[];
}

// Mirrors `marks/core/link.tsx`; the walker re-checks so a value that
// sneaks past the schema (migrated content, hand-edited storage)
// never reaches the rendered anchor.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;
function sanitizeHref(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed === "" || !SAFE_HREF.test(trimmed)) return undefined;
  return trimmed;
}

function wrapMark(mark: TiptapMark, child: ReactNode, key: string): ReactNode {
  const simpleTag: keyof JSX.IntrinsicElements | undefined =
    SIMPLE_MARK_TAGS[mark.type];
  if (simpleTag) return createElement(simpleTag, { key }, child);
  if (mark.type === "link") {
    const href = sanitizeHref(mark.attrs?.href);
    if (!href) return child;
    return createElement(
      "a",
      {
        key,
        href,
        target: mark.attrs?.target === "_blank" ? "_blank" : undefined,
        rel: "noopener noreferrer nofollow",
      },
      child,
    );
  }
  if (mark.type === "abbr") {
    const title =
      typeof mark.attrs?.title === "string" && mark.attrs.title.length > 0
        ? mark.attrs.title
        : undefined;
    return createElement("abbr", { key, title }, child);
  }
  return child;
}

function wrapWithMarks(
  text: string,
  marks: readonly TiptapMark[] | undefined,
  position: number,
): ReactNode {
  if (!marks || marks.length === 0) return text;
  return marks.reduceRight<ReactNode>(
    (acc, mark, markIndex) =>
      wrapMark(mark, acc, `${position}-${markIndex}-${mark.type}`),
    text,
  );
}

function renderParagraphChildren(
  paragraph: TiptapBlockNode,
): readonly ReactNode[] {
  const inline = paragraph.content ?? [];
  return inline.map((node, i) => {
    if (node.type !== "text") return null;
    const textNode = node as TiptapTextNode;
    return wrapWithMarks(textNode.text, textNode.marks, i);
  });
}

/**
 * Returns the inline content of the first paragraph child as React
 * nodes. Block-level shape callers (`<p>{renderInline(doc)}</p>`)
 * apply marks but stay one-paragraph; multi-paragraph docs go through
 * `renderInlineAll`.
 */
export function renderInline(doc: unknown): readonly ReactNode[] {
  if (typeof doc !== "object" || doc === null) return [];
  const root = doc as TiptapBlockNode;
  const firstChild = root.content?.[0];
  if (!firstChild) return [];
  return renderParagraphChildren(firstChild);
}

/**
 * Renders every paragraph child of the doc as its own `<p>` so an
 * Enter-key-separated body keeps every run.
 */
export function renderInlineAll(doc: unknown): readonly ReactNode[] {
  if (typeof doc !== "object" || doc === null) return [];
  const root = doc as TiptapBlockNode;
  const paragraphs = root.content ?? [];
  return paragraphs.map((para, i) =>
    createElement("p", { key: `p-${i}` }, renderParagraphChildren(para)),
  );
}
