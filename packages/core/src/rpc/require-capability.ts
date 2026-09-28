import type { Capability } from "../auth/contract/capability.js";
import { resolveCapability } from "../auth/contract/capability.js";
import { base } from "./base.js";

/**
 * Gate a procedure on a single capability known at router-definition time.
 * Compose after `authenticated`: `base.use(authenticated).use(requireCapability(cap))`.
 * Placed before `.input()` at every call site, so an unauthorized caller
 * gets FORBIDDEN even when their input also fails schema validation.
 *
 * A reference (`entryCapability(type, action)`) is resolved per request, since
 * the router is built before any registry exists to resolve it against.
 *
 * Doesn't fit procedures whose capability depends on a row fetched inside the
 * handler (e.g. an entry's type) — those stay hand-checked.
 */
export const requireCapability = (capability: Capability) =>
  base.middleware(async ({ context, next, errors }) => {
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({
        data: { capability: resolveCapability(context.plugins, capability) },
      });
    }
    return next();
  });
