// Public `ctx.audit.log()` API. Exposed via the plugin's `provides()`
// callback as a declaration-merge contribution to `AppContextExtensions`
// — third-party plugins call `ctx.audit?.log(ctx, {...})` from RPC
// handlers, route handlers, or hook listeners and the row joins the same
// buffered flush that the internal entry/user/term/settings listeners use.
//
// The row is recorded against the context the caller hands over, never
// the ambient one: the ambient context is built before authentication,
// and an authenticated procedure or route runs on a signed-in copy that
// never enters the request store (#2343). Taking an
// `AuthenticatedAppContext` is also what enforces "no anonymous events in
// the admin activity log" — a listener on a hook that can fire for a
// visitor has to narrow on `ctx.user` before it can call this.
//
// Contract:
//   - Returns void (not Promise<void>) so callers can't accidentally
//     await the deferred storage write.
//   - Multiple calls in one request batch into the same flush as the
//     internal hook listeners (same WeakMap key, same `ctx.defer`).

import type { JsonObject } from "plumix";
import type { AuthenticatedAppContext } from "plumix/plugin";

import type { AuditService } from "./auditService.js";
import { buildAuditRow } from "./buildAuditRow.js";

export interface AuditLogInput {
  readonly event: string;
  readonly subject: {
    readonly type: string;
    readonly id: string | number;
    readonly label?: string;
  };
  /** Free-form key/value map merged into the row's `properties` JSON. A `Date`
   *  has to be spelled `.toISOString()`. */
  readonly properties?: JsonObject;
}

export interface AuditExtension {
  log(ctx: AuthenticatedAppContext, input: AuditLogInput): void;
}

const FALLBACK_LABEL = "(unnamed)";

export function createAuditExtension(service: AuditService): AuditExtension {
  return {
    log(ctx, input) {
      const row = buildAuditRow({
        event: input.event,
        actor: { id: ctx.user.id, label: ctx.user.email },
        subject: {
          type: input.subject.type,
          id: String(input.subject.id),
          label: nonEmpty(input.subject.label) ?? FALLBACK_LABEL,
        },
        extraProperties: input.properties,
      });
      service.record(ctx, row);
    },
  };
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
