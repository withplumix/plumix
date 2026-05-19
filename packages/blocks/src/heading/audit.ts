import type { BlockNode } from "../render-block-tree.js";

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

function isBlockNodeArray(value: unknown): value is readonly BlockNode[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as BlockNode).id === "string" &&
        typeof (item as BlockNode).name === "string",
    )
  );
}

function collectHeadings(nodes: readonly BlockNode[]): readonly HeadingNode[] {
  const out: HeadingNode[] = [];
  function visit(list: readonly BlockNode[]): void {
    for (const node of list) {
      const attrs = node.attrs ?? {};
      if (node.name === "core/heading") {
        const rawLevel = (attrs as { readonly level?: unknown }).level;
        const level =
          typeof rawLevel === "number" &&
          Number.isInteger(rawLevel) &&
          rawLevel >= 1 &&
          rawLevel <= 6
            ? rawLevel
            : 2;
        const rawText = (attrs as { readonly text?: unknown }).text;
        const text = typeof rawText === "string" ? rawText : "";
        out.push({ id: node.id, level, text });
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
