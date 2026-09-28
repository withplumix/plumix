import type { AppContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { entryCapability } from "plumix/plugin";

import { MEDIA_ENTRY_TYPE } from "./read-service.js";

export const MEDIA_CREATE_CAPABILITY = entryCapability(
  MEDIA_ENTRY_TYPE,
  "create",
);

/**
 * Whether this caller may finish uploading this draft — PUT its bytes through
 * the worker route, or confirm it. The draft was minted behind media `create`,
 * so finishing asks the same of its owner and nothing else: the two steps
 * agree whether or not the storage presigns, and a non-owner never takes over
 * someone's half-finished upload, `edit_any` or not.
 */
export function canFinishUpload(
  ctx: Pick<AppContext, "user" | "auth">,
  draft: Pick<Entry, "authorId">,
): boolean {
  if (ctx.user?.id !== draft.authorId) return false;
  return ctx.auth.can(MEDIA_CREATE_CAPABILITY);
}
