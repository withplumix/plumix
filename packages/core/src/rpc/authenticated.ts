import { withUser } from "../context/app.js";
import { base } from "./base.js";

export const authenticated = base.middleware(
  async ({ context, next, errors }) => {
    // Delegates to whatever `RequestAuthenticator` the operator wired
    // up — session cookie by default, `cfAccess()` (or any other
    // implementation) when overridden. RPC enforces the same guard the
    // raw routes do, so a request that's authed for one path is authed
    // for the other.
    const result = await context.authenticator.authenticate(
      context.request,
      context.db,
    );
    if (!result) throw errors.UNAUTHORIZED();

    const { id, email, role } = result.user;
    const tokenScopes = result.tokenScopes ?? null;
    return next({
      context: withUser(context, { id, email, role }, tokenScopes),
    });
  },
);
