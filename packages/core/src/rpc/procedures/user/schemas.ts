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

// Meta bag accepted by `user.update`. Per-key validation runs against
// the user meta box registry in the handler; the outer shape cap
// mirrors `entry.meta` / `term.meta`.
const MAX_META_KEYS_PER_REQUEST = 200;

const metaKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-zA-Z0-9_:-]+$/, "meta key must be alphanumeric/_/:/-"),
);

const userMetaInputSchema = v.pipe(
  v.record(metaKeySchema, v.unknown()),
  v.check(
    (val) => Object.keys(val).length <= MAX_META_KEYS_PER_REQUEST,
    `meta accepts at most ${MAX_META_KEYS_PER_REQUEST} keys per request`,
  ),
);

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

// `email` is intentionally NOT in this schema. Email changes go
// through the dedicated `user.requestEmailChange` flow which sends
// a confirmation link to the new address — silently committing
// would let an admin (or hijacked self-session) redirect a user's
// recovery email without their consent.
export const userUpdateInputSchema = v.object({
  id: idParam,
  name: v.optional(v.nullable(nameField)),
  avatarUrl: v.optional(v.nullable(avatarUrlSchema)),
  role: v.optional(roleSchema),
  meta: v.optional(userMetaInputSchema),
});

export const userDisableInputSchema = v.object({ id: idParam });

export const userEnableInputSchema = v.object({ id: idParam });

export const userDeleteInputSchema = v.object({
  id: idParam,
  /** Reassign this user's authored entries to the given user id before deletion. */
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
