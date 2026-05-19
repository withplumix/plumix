import type { BlockNode, HeadingAuditViolation } from "@plumix/blocks";
import type { ReactNode } from "react";

import { analyzeHeadingStructure } from "@plumix/blocks";

interface HeadingAuditPanelProps {
  readonly tree: readonly BlockNode[];
}

export function HeadingAuditPanel({ tree }: HeadingAuditPanelProps): ReactNode {
  const violations = analyzeHeadingStructure(tree);

  if (violations.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground" data-testid="heading-audit-empty">
        No heading-structure issues detected.
      </div>
    );
  }

  return (
    <ul
      role="list"
      className="space-y-2 p-2"
      data-testid="heading-audit-list"
    >
      {violations.map((violation, index) => (
        <li
          key={`${violation.kind}-${index}`}
          role="listitem"
          className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"
          data-testid={`heading-audit-violation-${violation.kind}`}
          data-node-ids={nodeIdsFor(violation).join(",")}
        >
          <strong>Warning:</strong> {describe(violation)}
        </li>
      ))}
    </ul>
  );
}

function nodeIdsFor(violation: HeadingAuditViolation): readonly string[] {
  switch (violation.kind) {
    case "multiple-h1":
      return violation.nodeIds;
    case "skipped-level":
    case "empty-heading":
      return [violation.nodeId];
  }
}

function describe(violation: HeadingAuditViolation): string {
  switch (violation.kind) {
    case "multiple-h1":
      return `Multiple <h1> on the page (${violation.nodeIds.length} found). Keep only one top-level heading.`;
    case "skipped-level":
      return `Heading jumps from h${violation.from} to h${violation.to}. Insert an h${violation.from + 1} between them.`;
    case "empty-heading":
      return "Empty heading. Add text or remove the block.";
  }
}
