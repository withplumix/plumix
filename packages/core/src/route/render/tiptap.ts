import { escapeAttr, escapeHtml } from "./document.js";

/**
 * Tiptap / ProseMirror JSON → HTML walker. Accepts the JSON-encoded string
 * persisted in `posts.content` (or the parsed object) and renders it
 * against an allowlist of node and mark types. Unknown types render empty
 * — the walker is the trust boundary that keeps public HTML free of
 * injection regardless of what reaches the column.
 */
export function renderTiptapContent(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") {
    if (input.trim() === "") return "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return "";
    }
    return renderNode(parsed);
  }
  return renderNode(input);
}

interface TiptapMark {
  readonly type?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

interface TiptapNode {
  readonly type?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly marks?: readonly TiptapMark[];
  readonly content?: readonly unknown[];
}

function renderNode(value: unknown): string {
  if (value === null || typeof value !== "object") return "";
  const node = value as TiptapNode;
  switch (node.type) {
    case "doc":
      return renderChildren(node.content);
    case "paragraph":
      return `<p>${renderChildren(node.content)}</p>`;
    case "heading": {
      const level = clampHeadingLevel(node.attrs?.level);
      return `<h${level}>${renderChildren(node.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node.content)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node.content)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node.content)}</li>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node.content)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml(collectText(node.content))}</code></pre>`;
    case "horizontalRule":
      return "<hr />";
    case "hardBreak":
      return "<br />";
    case "text":
      return applyMarks(escapeHtml(node.text ?? ""), node.marks);
    default:
      return "";
  }
}

function renderChildren(content: readonly unknown[] | undefined): string {
  if (!content) return "";
  let out = "";
  for (const child of content) out += renderNode(child);
  return out;
}

function applyMarks(
  text: string,
  marks: readonly TiptapMark[] | undefined,
): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  // Marks are stored outside-in; wrap inside-out so the innermost tag is
  // the first mark in the array.
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    switch (mark?.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "link": {
        const href = sanitizeHref(mark.attrs?.href);
        if (href === null) break;
        out = `<a href="${escapeAttr(href)}" rel="noopener noreferrer nofollow">${out}</a>`;
        break;
      }
    }
  }
  return out;
}

function collectText(content: readonly unknown[] | undefined): string {
  if (!content) return "";
  let out = "";
  for (const child of content) {
    if (child && typeof child === "object") {
      const node = child as TiptapNode;
      if (typeof node.text === "string") out += node.text;
      else if (node.content) out += collectText(node.content);
    }
  }
  return out;
}

function clampHeadingLevel(level: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  if (typeof level !== "number") return 2;
  if (level < 1) return 1;
  if (level > 6) return 6;
  return Math.trunc(level) as 1 | 2 | 3 | 4 | 5 | 6;
}

// Mirrors the admin editor's link allowlist. Blocks javascript:, data:,
// vbscript:, file: and their variants; passes relative paths and
// `#fragment`.
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

function sanitizeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (trimmed === "") return null;
  return SAFE_HREF.test(trimmed) ? trimmed : null;
}
