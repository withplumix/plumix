import type { User } from "../../../db/schema/users.js";
import type { WithResolvedMeta } from "../../../meta/contract/bags.js";
import type {
  UserInviteInput,
  UserListInput,
  UserUpdateInput,
} from "./schemas.js";
import { defineFilter } from "../../../events-and-filters/define.js";
import { userEvents } from "../../../events-and-filters/user.js";

/**
 * `user.list` adds each row's latest session start, so the admin's users
 * table can show "Active 2d ago" or "Never".
 */
export type UserListRow = User & { readonly lastSignInAt: Date | null };

/**
 * Core's events and filters about users. Each `*Input` filter changes an RPC
 * procedure's input before it runs, and each `*Output` filter its result.
 */
export const user = {
  ...userEvents,
  listInput: defineFilter<UserListInput>("user:listInput", { sync: false }),
  listOutput: defineFilter<readonly UserListRow[]>("user:listOutput", {
    sync: false,
  }),
  getOutput: defineFilter<WithResolvedMeta<User>>("user:getOutput", {
    sync: false,
  }),
  inviteInput: defineFilter<UserInviteInput>("user:inviteInput", {
    sync: false,
  }),
  inviteOutput: defineFilter<{
    readonly user: User;
    readonly inviteToken: string;
  }>("user:inviteOutput", { sync: false }),
  updateInput: defineFilter<UserUpdateInput>("user:updateInput", {
    sync: false,
  }),
  updateOutput: defineFilter<WithResolvedMeta<User>>("user:updateOutput", {
    sync: false,
  }),
  disableInput: defineFilter<{ readonly id: number }>("user:disableInput", {
    sync: false,
  }),
  disableOutput: defineFilter<User>("user:disableOutput", { sync: false }),
  enableInput: defineFilter<{ readonly id: number }>("user:enableInput", {
    sync: false,
  }),
  enableOutput: defineFilter<User>("user:enableOutput", { sync: false }),
  deleteOutput: defineFilter<User>("user:deleteOutput", { sync: false }),
};
