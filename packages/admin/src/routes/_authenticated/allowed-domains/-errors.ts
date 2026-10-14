import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError } from "@plumix/core/admin";

const M = {
  errDomainExists: defineMessage({
    id: "allowedDomains.error.domainExists",
    message: "That domain is already configured.",
  }),
  errFallback: defineMessage({
    id: "allowedDomains.error.fallback",
    message: "Couldn't save the domain. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

/** Map an allowed-domain create failure to the copy the form shows: a known
 *  reason's copy, else the generic retry message. */
export function describeAllowedDomainError(err: unknown): MessageDescriptor {
  return describeRpcError(
    err,
    { domain_exists: M.errDomainExists },
    M.errFallback,
  );
}
