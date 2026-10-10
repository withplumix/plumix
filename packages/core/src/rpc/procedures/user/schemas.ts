import * as v from "valibot";

import { USER_ROLES } from "../../../db/schema/users.js";
import {
  emailField,
  idParam,
  metaInputSchema,
  nameField,
} from "../../contract/validation.js";
import { slugSchema } from "../../schemas.js";

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

/**
 * No `email`: changes go through `user.requestEmailChange` so an admin or
 * hijacked session can't redirect a user's recovery email without consent.
 */
export const userUpdateInputSchema = v.object({
  id: idParam,
  name: v.optional(v.nullable(nameField)),
  // Author-archive identifier (`/authors/{slug}`). Hand-editable unlike
  // the auto-dedup at creation — a taken slug surfaces a `slug_taken`
  // CONFLICT rather than silently appending a suffix.
  slug: v.optional(slugSchema),
  avatarUrl: v.optional(v.nullable(avatarUrlSchema)),
  role: v.optional(roleSchema),
  meta: v.optional(metaInputSchema),
});

export const userDisableInputSchema = v.object({ id: idParam });

export const userEnableInputSchema = v.object({ id: idParam });

export const userDeleteInputSchema = v.object({
  id: idParam,
  /**
   * Reassign this user's authored entries to the given user id before deletion.
   */
  reassignTo: v.optional(idParam),
});

export const userRequestEmailChangeInputSchema = v.object({
  id: idParam,
  newEmail: emailField,
});

export const userCancelEmailChangeInputSchema = v.object({ id: idParam });

export const userPendingEmailChangeInputSchema = v.object({ id: idParam });

export type UserListInput = v.InferOutput<typeof userListInputSchema>;
export type UserGetInput = v.InferOutput<typeof userGetInputSchema>;
export type UserInviteInput = v.InferOutput<typeof userInviteInputSchema>;
export type UserUpdateInput = v.InferOutput<typeof userUpdateInputSchema>;
export type UserDisableInput = v.InferOutput<typeof userDisableInputSchema>;
export type UserDeleteInput = v.InferOutput<typeof userDeleteInputSchema>;
