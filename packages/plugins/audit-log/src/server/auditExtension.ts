// Records against the caller's context, not the ambient one, which is built
// before authentication. Returns void so callers can't await the deferred
// write.

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
