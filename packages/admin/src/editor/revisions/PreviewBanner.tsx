import type { ReactElement } from "react";
import { Button } from "@/components/ui/button.js";

interface PreviewBannerProps {
  readonly revisionUpdatedAt: Date;
  readonly revisionAuthor: string;
  readonly relativeTime: (date: Date) => string;
  readonly onBackToLive: () => void;
  readonly onRestore: () => void;
  readonly isRestoring: boolean;
  // Surface restore failures inline. CONFLICT (stale token) is the
  // most likely cause — another tab edited the live entry after the
  // preview loaded — but any server rejection lands here so the user
  // doesn't watch a silent no-op.
  readonly restoreError?: string | null;
}

export function PreviewBanner({
  revisionUpdatedAt,
  revisionAuthor,
  relativeTime,
  onBackToLive,
  onRestore,
  isRestoring,
  restoreError = null,
}: PreviewBannerProps): ReactElement {
  return (
    <div
      data-testid="revision-preview-banner"
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="font-medium">Previewing revision</span>
      <span>
        from {relativeTime(revisionUpdatedAt)} by {revisionAuthor}
      </span>
      <div className="ml-auto flex gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="revision-preview-back-to-live"
          onClick={onBackToLive}
        >
          ← Back to live
        </Button>
        <Button
          variant="default"
          size="sm"
          data-testid="revision-preview-restore"
          onClick={onRestore}
          disabled={isRestoring}
        >
          {isRestoring ? "Restoring…" : "Restore this revision"}
        </Button>
      </div>
      {restoreError !== null ? (
        <div
          data-testid="revision-preview-restore-error"
          role="alert"
          className="text-destructive basis-full text-xs"
        >
          {restoreError}
        </div>
      ) : null}
    </div>
  );
}
