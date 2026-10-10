import type { ReactNode } from "react";
import { useParams } from "@tanstack/react-router";

import { CardPreviewPanel } from "./CardPreviewPanel.js";

/**
 * Reads the open entry off the editor's route: a field renderer is handed only
 * its own value.
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

/** Null on the create form, where no row exists yet. */
function useEntryId(): number | null {
  const params: Record<string, string | undefined> = useParams({
    strict: false,
  });
  const id = Number(params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
