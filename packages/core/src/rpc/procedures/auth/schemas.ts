import * as v from "valibot";

import { idParam } from "../../contract/validation.js";

const sessionUserSchema = v.object({
  id: idParam,
  email: v.string(),
  name: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  role: v.string(),
  capabilities: v.array(v.string()),
});

export const authSessionOutputSchema = v.object({
  user: v.nullable(sessionUserSchema),
  /**
   * True when the instance has zero users, so the admin routes to bootstrap.
   * Always false when `user` is non-null.
   */
  needsBootstrap: v.boolean(),
});

export type AuthSessionOutput = v.InferOutput<typeof authSessionOutputSchema>;
export type AuthSessionUser = NonNullable<AuthSessionOutput["user"]>;
