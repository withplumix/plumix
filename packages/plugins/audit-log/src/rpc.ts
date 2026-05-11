// Hand-rolled oRPC router for the audit-log plugin. v0.1 ships
// `auditLog.list` with filter + cursor pagination (slice #180).
//
// Filter semantics:
// - All filter params optional, combinable.
// - `cursor` is opaque base64 from a previous page's `nextCursor`.
// - `limit` defaults to 50, clamps silently at 200 (values above don't
//   error — admin pages frequently pass through user input that we
//   don't want to surface as 4xx).
// - Tampered cursors decode-fail in storage and surface as a typed
//   `BAD_REQUEST` (`reason: "invalid_cursor"`), never a 5xx.

import { authenticated, base } from "plumix/plugin";
import * as v from "valibot";

import type { AuditLogQueryResult, AuditLogStorage } from "./types.js";
import { CursorError } from "./server/cursor.js";

const AUDIT_LOG_READ_CAPABILITY = "audit_log:read";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const listInputSchema = v.optional(
  v.object({
    limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
    actorId: v.optional(v.pipe(v.number(), v.integer())),
    subjectType: v.optional(v.pipe(v.string(), v.minLength(1))),
    subjectId: v.optional(v.pipe(v.string(), v.minLength(1))),
    eventPrefix: v.optional(v.pipe(v.string(), v.minLength(1))),
    occurredAfter: v.optional(v.pipe(v.number(), v.integer())),
    occurredBefore: v.optional(v.pipe(v.number(), v.integer())),
    cursor: v.optional(v.string()),
  }),
);

export function createAuditLogRouter(storage: AuditLogStorage) {
  const list = base
    .use(authenticated)
    .input(listInputSchema)
    .handler(
      async ({ input, context, errors }): Promise<AuditLogQueryResult> => {
        if (!context.auth.can(AUDIT_LOG_READ_CAPABILITY)) {
          throw errors.FORBIDDEN({
            data: { capability: AUDIT_LOG_READ_CAPABILITY },
          });
        }
        const requestedLimit = input?.limit ?? DEFAULT_LIMIT;
        const limit = Math.min(requestedLimit, MAX_LIMIT);
        try {
          return await storage.query(context, {
            limit,
            actorId: input?.actorId,
            subjectType: input?.subjectType,
            subjectId: input?.subjectId,
            eventPrefix: input?.eventPrefix,
            occurredAfter: input?.occurredAfter,
            occurredBefore: input?.occurredBefore,
            cursor: input?.cursor,
          });
        } catch (error) {
          // Only `CursorError` instances from `decodeCursor` route to
          // BAD_REQUEST. Custom storage adapters that wrap exceptions
          // must re-throw the original `CursorError` to keep this path.
          if (error instanceof CursorError) {
            throw errors.BAD_REQUEST({ data: { reason: "invalid_cursor" } });
          }
          throw error;
        }
      },
    );

  return { list };
}
