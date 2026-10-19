import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

/** How a resource's conflict dialog and lease banner name what is edited. */
export interface EditingCopy {
  readonly conflictTitle: MessageDescriptor;
  /** `{name}` is editing it `{time}`. */
  readonly heldBy: MessageDescriptor;
  /** `{name}` took it over at `{time}`. */
  readonly lost: MessageDescriptor;
}

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
