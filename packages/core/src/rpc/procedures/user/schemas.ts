import * as v from "valibot";

import { USER_ROLES } from "../../../db/schema/users.js";
import { emailField, idParam, nameField } from "../../validation.js";

const avatarUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(2048),
  v.url(),
);

const roleSchema = v.picklist(USER_ROLES);

const searchSchema = v.pipe(v.string(), v.trim(), v.maxLength(200));

export const userListInputSchema = v.object({
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    20,
  ),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  role: v.optional(roleSchema),
  search: v.optional(searchSchema),
});

export const userGetInputSchema = v.object({ id: idParam });

export const userInviteInputSchema = v.object({
  email: emailField,
  role: v.optional(roleSchema, "subscriber"),
  name: v.optional(v.nullable(nameField)),
});

export const userUpdateInputSchema = v.object({
  id: idParam,
  email: v.optional(emailField),
  name: v.optional(v.nullable(nameField)),
  avatarUrl: v.optional(v.nullable(avatarUrlSchema)),
  role: v.optional(roleSchema),
});

export const userDisableInputSchema = v.object({ id: idParam });

export const userEnableInputSchema = v.object({ id: idParam });

export const userDeleteInputSchema = v.object({
  id: idParam,
  /** Reassign this user's authored posts to the given user id before deletion. */
  reassignPostsTo: v.optional(idParam),
});

export type UserListInput = v.InferOutput<typeof userListInputSchema>;
export type UserGetInput = v.InferOutput<typeof userGetInputSchema>;
export type UserInviteInput = v.InferOutput<typeof userInviteInputSchema>;
export type UserUpdateInput = v.InferOutput<typeof userUpdateInputSchema>;
export type UserDisableInput = v.InferOutput<typeof userDisableInputSchema>;
export type UserDeleteInput = v.InferOutput<typeof userDeleteInputSchema>;
