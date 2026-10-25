import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

/**
 * `lingui extract` reads only macro calls, and the manifest hands the admin
 * these labels as plain descriptors, so the ids are spelled here too.
 * Guarded by: packages/admin/src/lib/core-role-labels-i18n.test.ts
 */
export const CORE_ROLE_LABEL_DESCRIPTORS = {
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
} satisfies Record<string, MessageDescriptor>;
