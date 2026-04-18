import { readSessionCookie } from "../auth/cookies.js";
import { validateSession } from "../auth/sessions.js";
import { withUser } from "../context/app.js";
import { base } from "./base.js";

export const authenticated = base.middleware(
  async ({ context, next, errors }) => {
    const token = readSessionCookie(context.request);
    if (!token) throw errors.UNAUTHORIZED();

    const validated = await validateSession(context.db, token);
    if (!validated) throw errors.UNAUTHORIZED();

    const { id, email, role } = validated.user;
    return next({ context: withUser(context, { id, email, role }) });
  },
);
