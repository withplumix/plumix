import { authenticated, base, requireCapability } from "plumix/plugin";
import * as v from "valibot";

import type {
  AuditLogQueryResult,
  AuditLogRow,
  AuditLogStorage,
} from "./types.js";
import { CursorError } from "./server/cursor.js";

const AUDIT_LOG_READ_CAPABILITY = "audit_log:read";

const DEFAULT_LIMIT = 50;
// Clamped silently, not rejected: admin pages pass user input through, and it
// shouldn't surface as a 4xx.
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

type AuditLogRowDTO = Omit<AuditLogRow, "occurredAt"> & {
  readonly occurredAt: string;
};

interface AuditLogPage {
  readonly rows: readonly AuditLogRowDTO[];
  readonly nextCursor: string | null;
}

export function createAuditLogRouter(storage: AuditLogStorage) {
  const list = base
    .use(authenticated)
    .use(requireCapability(AUDIT_LOG_READ_CAPABILITY))
    .input(listInputSchema)
    .handler(async ({ input, context, errors }): Promise<AuditLogPage> => {
      const requestedLimit = input?.limit ?? DEFAULT_LIMIT;
      const limit = Math.min(requestedLimit, MAX_LIMIT);
      let page: AuditLogQueryResult;
      try {
        page = await storage.query(context, {
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
      return {
        rows: page.rows.map((row) => ({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      };
    });

  return { list };
}

/**
 * The admin chunk's wire contract, imported there with `import type` so this
 * module stays server-only.
 */
export type AuditLogRouter = ReturnType<typeof createAuditLogRouter>;
