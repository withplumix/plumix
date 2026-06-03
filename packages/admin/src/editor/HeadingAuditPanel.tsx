import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";

import type { BlockNode, HeadingAuditViolation } from "@plumix/blocks";
import { analyzeHeadingStructure } from "@plumix/blocks";

const M = {
  multipleH1: defineMessage({
    id: "editor.headingAudit.multipleH1",
    message:
      "Multiple <h1> on the page ({count} found). Keep only one top-level heading.",
    comment: "count: number of h1 elements detected in the editor tree",
  }),
  skippedLevel: defineMessage({
    id: "editor.headingAudit.skippedLevel",
    message:
      "Heading jumps from h{from} to h{to}. Insert an h{between} between them.",
    comment:
      "from, to, between: integer heading levels 1-6; e.g. from=2, to=4, between=3",
  }),
  emptyHeading: defineMessage({
    id: "editor.headingAudit.emptyHeading",
    message: "Empty heading. Add text or remove the block.",
  }),
} satisfies Record<string, MessageDescriptor>;

interface HeadingAuditPanelProps {
  readonly tree: readonly BlockNode[];
  readonly onSelect?: (nodeId: string) => void;
}

export function HeadingAuditPanel({
  tree,
  onSelect,
}: HeadingAuditPanelProps): ReactNode {
  const violations = analyzeHeadingStructure(tree);
  const { i18n } = useLingui();
  const label = useLabel();

  if (violations.length === 0) {
    return (
      <div
        className="text-muted-foreground p-4 text-sm"
        data-testid="heading-audit-empty"
      >
        <Trans
          id="editor.headingAudit.empty"
          message="No heading-structure issues detected."
        />
      </div>
    );
  }

  return (
    <ul role="list" className="space-y-2 p-4" data-testid="heading-audit-list">
      {violations.map((violation, index) => {
        const nodeIds = nodeIdsFor(violation);
        const primaryId = nodeIds[0];
        const message = (
          <>
            <strong>
              <Trans
                id="editor.headingAudit.warningPrefix"
                message="Warning:"
              />
            </strong>{" "}
            {describe(violation, i18n, label)}
          </>
        );
        return (
          <li
            key={`${violation.kind}-${index}`}
            role="listitem"
            className="rounded border border-amber-200 bg-amber-50 p-2 text-sm"
            data-testid={`heading-audit-violation-${violation.kind}`}
            data-node-ids={nodeIds.join(",")}
          >
            {onSelect && primaryId !== undefined ? (
              <button
                type="button"
                onClick={() => onSelect(primaryId)}
                className="w-full text-left"
                data-testid={`heading-audit-jump-${violation.kind}`}
              >
                {message}
              </button>
            ) : (
              message
            )}
          </li>
        );
      })}
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

// Three message shapes, three ICU placeholder sets. Resolved via the
// 3-arg `i18n._` form so the descriptor's `.message` flows in as
// extractor-visible fallback; `useLabel` handles the placeholder-free
// `emptyHeading` branch.
function describe(
  violation: HeadingAuditViolation,
  i18n: ReturnType<typeof useLingui>["i18n"],
  label: (l: MessageDescriptor) => string,
): string {
  switch (violation.kind) {
    case "multiple-h1":
      return i18n._(
        M.multipleH1.id,
        { count: violation.nodeIds.length },
        { message: M.multipleH1.message },
      );
    case "skipped-level":
      return i18n._(
        M.skippedLevel.id,
        {
          from: violation.from,
          to: violation.to,
          between: violation.from + 1,
        },
        { message: M.skippedLevel.message },
      );
    case "empty-heading":
      return label(M.emptyHeading);
  }
}
