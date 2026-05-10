// Hand-rolled oRPC router for the audit-log plugin. Mirrors the menu
// plugin's pattern. v0.1 is just `auditLog.list` — capability-gated,
// returns the latest 50 rows. Slice #180 adds filters + cursor
// pagination.

import * as v from "valibot";

import { authenticated, base } from "@plumix/core";

import type { AuditLogRow, AuditLogStorage } from "./types.js";

const AUDIT_LOG_READ_CAPABILITY = "audit_log:read";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface AuditLogListResponse {
  readonly rows: readonly AuditLogRow[];
}

export function createAuditLogRouter(
  storage: AuditLogStorage,
): Record<string, unknown> {
  const list = base
    .use(authenticated)
    .input(
      v.object({
        limit: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_LIMIT)),
        ),
      }),
    )
    .handler(
      async ({ input, context, errors }): Promise<AuditLogListResponse> => {
        if (!context.auth.can(AUDIT_LOG_READ_CAPABILITY)) {
          throw errors.FORBIDDEN({
            data: { capability: AUDIT_LOG_READ_CAPABILITY },
          });
        }
        const rows = await storage.query(context, {
          limit: input.limit ?? DEFAULT_LIMIT,
        });
        return { rows };
      },
    );

  return { list };
}
