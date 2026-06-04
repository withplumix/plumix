import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

const M = {
  restoring: defineMessage({
    id: "editor.revisions.preview.restoring",
    message: "Restoring…",
  }),
  restore: defineMessage({
    id: "editor.revisions.preview.restore",
    message: "Restore this revision",
  }),
} satisfies Record<string, MessageDescriptor>;

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
  const renderLabel = useLabel();
  return (
    <div
      data-testid="revision-preview-banner"
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="font-medium">
        <Trans
          id="editor.revisions.preview.title"
          message="Previewing revision"
        />
      </span>
      <span>
        <Trans
          id="editor.revisions.preview.subtitle"
          message="from {when} by {author}"
          values={{
            when: relativeTime(revisionUpdatedAt),
            author: <bdi>{revisionAuthor}</bdi>,
          }}
          comment="when: pre-formatted relative-time like '2 hours ago'; author: the user's display name or email"
        />
      </span>
      <div className="ms-auto flex gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="revision-preview-back-to-live"
          onClick={onBackToLive}
        >
          <Trans
            id="editor.revisions.preview.backToLive"
            message="← Back to live"
          />
        </Button>
        <Button
          variant="default"
          size="sm"
          data-testid="revision-preview-restore"
          onClick={onRestore}
          disabled={isRestoring}
        >
          {isRestoring ? renderLabel(M.restoring) : renderLabel(M.restore)}
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
