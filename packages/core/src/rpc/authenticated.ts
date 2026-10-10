import { authenticateTraced, tokenScopesOf } from "../auth/authenticator.js";
import { withUser } from "../auth/with-user.js";
import { base } from "./base.js";

export const authenticated = base.middleware(
  async ({ context, next, errors }) => {
    // Same authenticator the raw routes use, so a request authed for one path
    // is authed for the other.
    const result = await authenticateTraced(context, context.authenticator);
    if (!result) throw errors.UNAUTHORIZED();

    const { id, email, role, meta } = result.user;
    const tokenScopes = tokenScopesOf(result);
    return next({
      context: withUser(context, { id, email, role, meta }, tokenScopes),
    });
  },
);
