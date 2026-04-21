import * as v from "valibot";

import { USER_ROLES } from "../../../db/schema/users.js";
import { idParam } from "../../validation.js";

const sessionUserSchema = v.object({
  id: idParam,
  email: v.string(),
  name: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  role: v.picklist(USER_ROLES),
  /**
   * Effective capability names granted to this user — core + derived
   * post-type/taxonomy caps + plugin-defined caps, resolved server-side
   * from the role hierarchy. The admin uses this to gate nav items and
   * UI actions without re-implementing the role → capability mapping.
   */
  capabilities: v.array(v.string()),
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
