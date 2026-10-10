import type { AppContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { entryCapability } from "plumix/plugin";

import { MEDIA_ENTRY_TYPE } from "./read-service.js";

export const MEDIA_CREATE_CAPABILITY = entryCapability(
  MEDIA_ENTRY_TYPE,
  "create",
);

/**
 * Owner-only, asking the same `create` that minted the draft: a non-owner never
 * takes over a half-finished upload, `edit_any` or not.
 */
export function canFinishUpload(
  ctx: Pick<AppContext, "user" | "auth">,
  draft: Pick<Entry, "authorId">,
): boolean {
  if (ctx.user?.id !== draft.authorId) return false;
  return ctx.auth.can(MEDIA_CREATE_CAPABILITY);
}
