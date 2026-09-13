import type { KnownCapability } from "../auth/rbac.js";
import { base } from "./base.js";

/**
 * Gate a procedure on a single capability known at router-definition time.
 * Compose after `authenticated`: `base.use(authenticated).use(requireCapability(cap))`.
 * Placed before `.input()` at every call site, so an unauthorized caller
 * gets FORBIDDEN even when their input also fails schema validation.
 *
 * Doesn't fit procedures whose capability depends on a row fetched inside the
 * handler (e.g. an entry's type) — those stay hand-checked.
 */
export const requireCapability = (
  capability: KnownCapability | (string & {}),
) =>
  base.middleware(async ({ context, next, errors }) => {
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }
    return next();
  });
