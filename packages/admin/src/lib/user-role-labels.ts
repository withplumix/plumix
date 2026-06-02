import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import type { UserRole } from "@plumix/core/schema";

/**
 * Translatable display labels for `UserRole`. Lives in `@/lib` because
 * the same descriptors render in every users-adjacent surface:
 * `/users` list, `/users/create`, `/users/$id/edit`, and the
 * `/allowed-domains` default-role picker.
 *
 * The `userRole.*` IDs are workspace-wide — keep callsites importing
 * from this module rather than redefining the record.
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
