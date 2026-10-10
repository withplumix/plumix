import type { Capability } from "../access/contract/capability.js";
import { resolveCapability } from "../access/contract/capability.js";
import { base } from "./base.js";

/**
 * Place before `.input()` so an unauthorized caller gets FORBIDDEN even when
 * the input also fails validation. A capability reference resolves per request.
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
