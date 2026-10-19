import { defineMessage } from "@lingui/core/macro";

import type { EditingCopy } from "@plumix/core/admin";

export const ENTRY_EDITING_COPY: EditingCopy = {
  conflictTitle: defineMessage({
    id: "editor.conflict.title",
    message: "This entry changed since you opened it",
  }),
  heldBy: defineMessage({
    id: "editor.lease.heldBy",
    message: "{name} is editing this entry (since {time})",
    comment:
      "name: the editing user's display name or email; time: a formatted date and time",
  }),
  lost: defineMessage({
    id: "editor.lease.lost",
    message:
      "{name} took over editing this entry at {time}. Your unsaved changes are shown here but weren't saved.",
    comment: "name: the user who took over; time: a formatted date and time",
  }),
};
