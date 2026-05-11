// Public `ctx.audit.log()` API. Exposed via the plugin's `provides()`
// callback as a declaration-merge contribution to `AppContextExtensions`
// — third-party plugins call `ctx.audit?.log({...})` from RPC handlers,
// route handlers, or hook listeners and the row joins the same buffered
// flush that the internal entry/user/term/settings listeners use.
//
// Chokepoint: the helper checks `ctx.user` before recording. A frontend
// request (no signed-in user) drops with a debug log instead of writing
// to the audit feed. This enforces "no anonymous events in the admin
// activity log" by code, not by convention.
//
// Contract:
//   - Returns void (not Promise<void>) so callers can't accidentally
//     await the deferred storage write.
//   - Calls outside `requestStore.run` drop silently — there's no
//     per-request buffer to attach to.
//   - Multiple calls in one request batch into the same flush as the
//     internal hook listeners (same WeakMap key, same `ctx.defer`).

import { tryGetContext } from "@plumix/core";

import type { AuditService } from "./auditService.js";
import { buildAuditRow } from "./buildAuditRow.js";

export interface AuditLogInput {
  readonly event: string;
  readonly subject: {
    readonly type: string;
    readonly id: string | number;
    readonly label?: string;
  };
  /** Free-form key/value map merged into the row's `properties` JSON. */
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface AuditExtension {
  log(input: AuditLogInput): void;
}

const FALLBACK_LABEL = "(unnamed)";

export function createAuditExtension(service: AuditService): AuditExtension {
  return {
    log(input) {
      const ctx = tryGetContext();
      if (!ctx) {
        // Outside requestStore — no per-request buffer exists. Silent
        // drop is intentional: a stray call during plugin setup or a
        // background task shouldn't crash.
        return;
      }
      if (!ctx.user) {
        ctx.logger.debug(
          `ctx.audit.log("${input.event}") dropped — no user on AppContext`,
        );
        return;
      }
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
