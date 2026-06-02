import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { UserRole } from "@plumix/core/schema";

/**
 * Translatable display labels for `UserRole`. Lives in `@/lib` because
 * the same descriptors render in every users-adjacent surface:
 * `/users` list, `/users/create`, `/users/$id/edit`, and the
 * `/allowed-domains` default-role picker.
 *
 * `ROLE_LABEL` is the short form for badges / sidebar / list rows.
 * `ROLE_LABEL_LONG` is the picker-option form with affordance copy
 * (the trade-offs spelled out) — used by the invite-user and
 * edit-user role pickers. IDs are workspace-wide; keep callsites
 * importing from this module rather than redefining the records.
 */
export const ROLE_LABEL: Record<UserRole, MessageDescriptor> = {
  subscriber: defineMessage({
    id: "userRole.subscriber",
    message: "Subscriber",
  }),
  contributor: defineMessage({
    id: "userRole.contributor",
    message: "Contributor",
  }),
  author: defineMessage({ id: "userRole.author", message: "Author" }),
  editor: defineMessage({ id: "userRole.editor", message: "Editor" }),
  admin: defineMessage({ id: "userRole.admin", message: "Administrator" }),
};

export const ROLE_LABEL_LONG: Record<UserRole, MessageDescriptor> = {
  subscriber: defineMessage({
    id: "userRole.long.subscriber",
    message: "Subscriber — read only",
  }),
  contributor: defineMessage({
    id: "userRole.long.contributor",
    message: "Contributor — draft, no publish",
  }),
  author: defineMessage({
    id: "userRole.long.author",
    message: "Author — publish own entries",
  }),
  editor: defineMessage({
    id: "userRole.long.editor",
    message: "Editor — publish + edit any post",
  }),
  admin: defineMessage({
    id: "userRole.long.admin",
    message: "Administrator — full control",
  }),
};
