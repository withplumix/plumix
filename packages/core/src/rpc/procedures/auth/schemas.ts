import * as v from "valibot";

import { USER_ROLES } from "../../../db/schema/users.js";

const sessionUserSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  email: v.string(),
  name: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  role: v.picklist(USER_ROLES),
});

export const authSessionOutputSchema = v.object({
  user: v.nullable(sessionUserSchema),
  /**
   * True when the instance has zero users — the admin UI should route to
   * the first-admin bootstrap screen instead of the sign-in form. False
   * whenever `user` is non-null (an authed caller means at least one
   * user exists).
   */
  needsBootstrap: v.boolean(),
});

export type AuthSessionOutput = v.InferOutput<typeof authSessionOutputSchema>;
export type AuthSessionUser = NonNullable<AuthSessionOutput["user"]>;
