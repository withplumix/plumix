import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { EntryStatus } from "@plumix/core/manifest";

export const ENTRY_STATUS_LABEL: Record<EntryStatus, MessageDescriptor> = {
  draft: defineMessage({
    id: "entries.list.statusFilter.draft",
    message: "Draft",
    context: "entry status",
  }),
  published: defineMessage({
    id: "entries.list.statusFilter.published",
    message: "Published",
  }),
  scheduled: defineMessage({
    id: "entries.list.statusFilter.scheduled",
    message: "Scheduled",
  }),
  trash: defineMessage({
    id: "entries.list.statusFilter.trash",
    message: "Trash",
    context: "entry status",
  }),
};
