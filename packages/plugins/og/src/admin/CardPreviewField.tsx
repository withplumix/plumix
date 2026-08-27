import type { ReactNode } from "react";
import { useParams } from "@tanstack/react-router";

import { CardPreviewPanel } from "./CardPreviewPanel.js";

/**
 * The preview as the meta box mounts it. All this adds is which entry is open,
 * read off the editor's own route — a plugin field renderer is handed its own
 * value and nothing about the entity around it.
 */
export function CardPreviewField({
  disabled,
  testId,
}: {
  readonly disabled: boolean;
  readonly testId: string;
}): ReactNode {
  return (
    <CardPreviewPanel
      entryId={useEntryId()}
      disabled={disabled}
      testId={testId}
    />
  );
}

/** The open entry, or null on the create form — where no row exists yet. */
function useEntryId(): number | null {
  const params: Record<string, string | undefined> = useParams({
    strict: false,
  });
  const id = Number(params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
