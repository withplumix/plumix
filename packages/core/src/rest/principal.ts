import type { AppContext, AuthenticatedUser } from "../context/app.js";
import { withUser } from "../context/app.js";

// The lowest role: reads published content, holds no edit/admin capability.
// An anonymous REST request reads through this principal, so the entry
// services' existing status-clamping and hide-existence (404) policy applies
// unchanged — no REST-specific status filtering.
const PUBLIC_PRINCIPAL: AuthenticatedUser = {
  id: 0,
  email: "",
  role: "subscriber",
  meta: {},
};

export function withPublicPrincipal(ctx: AppContext): AppContext {
  return withUser(ctx, PUBLIC_PRINCIPAL);
}
