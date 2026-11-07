import type { User } from "../db/schema/users.js";
import type { MetaChanges } from "../meta/contract/bags.js";
import { defineEvent } from "./define.js";

/** Core's events about users; `user` in `plumix/plugin` adds the RPC filters. */
export const userEvents = {
  /**
   * SECURITY: `inviteToken` is the raw credential (the database stores a
   * hash). Never log or forward it; it completes registration until consumed
   * or expired (7 days).
   */
  invited: defineEvent<{
    readonly user: User;
    readonly inviteToken: string;
    readonly invitedBy: number;
    readonly expiresAt: Date;
  }>("user:invited"),
  /**
   * Fires only when row columns changed. `user.meta` predates any meta write
   * in the same call, so use `metaChanged` for meta.
   */
  updated: defineEvent<{ readonly user: User; readonly previous: User }>(
    "user:updated",
  ),
  /** Fires after a meta write through `user.update`. */
  metaChanged: defineEvent<{
    readonly user: { readonly id: number };
    readonly changes: MetaChanges;
  }>("user:metaChanged"),
  /**
   * Fires on both disable and re-enable. The user's sessions are already
   * invalidated.
   */
  statusChanged: defineEvent<{
    readonly user: User;
    readonly enabled: boolean;
  }>("user:statusChanged"),
  /** `reassignedTo` is `null` when the deleted user had no entries. */
  deleted: defineEvent<{
    readonly user: User;
    readonly reassignedTo: number | null;
  }>("user:deleted"),
};
