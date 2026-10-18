import type { EditLeaseNotice } from "@/editor/edit-lease.js";
import type { ReactElement } from "react";
import { useFormatters } from "@/lib/use-formatters.js";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";

interface EditLeaseBannerProps {
  readonly notice: EditLeaseNotice;
  /** Offered only while another user holds the lease. */
  readonly onTakeOver: () => void;
  readonly isTakingOver: boolean;
  readonly onBack: () => void;
}

/** Why the editor is read-only: someone else is editing the entry. */
export function EditLeaseBanner({
  notice,
  onTakeOver,
  isTakingOver,
  onBack,
}: EditLeaseBannerProps): ReactElement {
  const { formatDate } = useFormatters();
  const time = formatDate(
    notice.kind === "heldByOther" ? notice.since : notice.at,
    { dateStyle: "medium", timeStyle: "short" },
  );
  const name = <bdi>{notice.name}</bdi>;
  return (
    <div
      data-testid="edit-lease-banner"
      role="status"
      className="border-warning/30 bg-warning/10 text-warning-foreground flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 text-sm"
    >
      {notice.kind === "heldByOther" ? (
        <span data-testid="edit-lease-held-by">
          <Trans
            id="editor.lease.heldBy"
            message="{name} is editing this entry (since {time})"
            values={{ name, time }}
            comment="name: the editing user's display name or email; time: a formatted date and time"
          />
        </span>
      ) : (
        <span data-testid="edit-lease-lost">
          <Trans
            id="editor.lease.lost"
            message="{name} took over editing this entry at {time}. Your unsaved changes are shown here but weren't saved."
            values={{ name, time }}
            comment="name: the user who took over; time: a formatted date and time"
          />
        </span>
      )}
      <div className="ms-auto flex gap-2">
        <Button
          variant="outline"
          size="sm"
          data-testid="edit-lease-back"
          onClick={onBack}
        >
          <Trans id="editor.lease.back" message="Back" />
        </Button>
        {notice.kind === "heldByOther" ? (
          <Button
            variant="default"
            size="sm"
            data-testid="edit-lease-take-over"
            onClick={onTakeOver}
            disabled={isTakingOver}
          >
            <Trans id="editor.lease.takeOver" message="Take over" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
