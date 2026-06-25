import type { BlockNode } from "./render-block-tree.js";
import { isBlockNodeArray } from "./render-block-tree.js";

export type HeadingAuditViolation =
  | { readonly kind: "multiple-h1"; readonly nodeIds: readonly string[] }
  | {
      readonly kind: "skipped-level";
      readonly nodeId: string;
      readonly from: number;
      readonly to: number;
    }
  | { readonly kind: "empty-heading"; readonly nodeId: string };

interface HeadingNode {
  readonly id: string;
  readonly level: number;
  readonly text: string;
}

// h1–h6 elements in document order. The inner capture is lazy and anchored to
// the matching close tag; the open-tag class excludes `>` so the matcher stays
// a single linear pass over the (editor-produced, sanitised) body HTML.
const HEADING_RE = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

// Strip inner tags and decode `&nbsp;` so the empty-heading check sees the
// visible text — `<h2><strong>x</strong></h2>` is not empty, `<h2></h2>` is.
// The strip loops to a fixpoint so a crafted `<sc<b>ript>` can't reconstruct a
// tag after a single pass; the text is only used for emptiness/word checks
// (never rendered), but a complete strip keeps it honest. Heading text is a
// short line, so the bounded re-scan is cheap.
function headingText(rawInner: string): string {
  let text = rawInner;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, "");
  } while (text !== previous);
  return text.replace(/&nbsp;/gi, " ");
}

function collectHeadings(nodes: readonly BlockNode[]): readonly HeadingNode[] {
  const out: HeadingNode[] = [];
  function visit(list: readonly BlockNode[]): void {
    for (const node of list) {
      const attrs = node.attrs ?? {};
      // Headings are inline formats of the rich-text body, so parse them out of
      // its HTML rather than reading a dedicated Heading block.
      if (node.name === "core/rich-text") {
        const body = (attrs as { readonly body?: unknown }).body;
        if (typeof body === "string") {
          for (const match of body.matchAll(HEADING_RE)) {
            out.push({
              id: node.id,
              level: Number(match[1]),
              text: headingText(match[2] ?? ""),
            });
          }
        }
      }
      for (const value of Object.values(attrs)) {
        if (isBlockNodeArray(value)) visit(value);
      }
    }
  }
  visit(nodes);
  return out;
}

export function analyzeHeadingStructure(
  nodes: readonly BlockNode[],
): readonly HeadingAuditViolation[] {
  const headings = collectHeadings(nodes);
  if (headings.length === 0) return [];

  const violations: HeadingAuditViolation[] = [];

  const h1Ids = headings.filter((h) => h.level === 1).map((h) => h.id);
  if (h1Ids.length > 1) {
    violations.push({ kind: "multiple-h1", nodeIds: h1Ids });
  }

  let previousLevel: number | null = null;
  for (const heading of headings) {
    if (previousLevel !== null && heading.level > previousLevel + 1) {
      violations.push({
        kind: "skipped-level",
        nodeId: heading.id,
        from: previousLevel,
        to: heading.level,
      });
    }
    previousLevel = heading.level;
    if (heading.text.trim().length === 0) {
      violations.push({ kind: "empty-heading", nodeId: heading.id });
    }
  }

  return violations;
}
