import { definePlugin } from "plumix/plugin";

import type { AuditExtension } from "./server/auditExtension.js";
import type { AuditLogRetentionConfig } from "./server/retention.js";
import type { AuditLogStorage } from "./types.js";
import * as schema from "./db/schema.js";
import { createAuditLogRouter } from "./rpc.js";
import { createAuditExtension } from "./server/auditExtension.js";
import { createAuditService } from "./server/auditService.js";
import { registerHooks } from "./server/hooks.js";
import {
  assertValidRetention,
  DEFAULT_PURGE_CRON,
  DEFAULT_RETENTION,
  runRetentionPurge,
} from "./server/retention.js";
import { sqlite } from "./server/storage-sqlite.js";

export type {
  AuditLogStorage,
  AuditLogRow,
  AuditLogQueryFilter,
} from "./types.js";
export type { AuditExtension, AuditLogInput } from "./server/auditExtension.js";
export type {
  AuditLogRetentionConfig,
  AuditLogRetentionPolicy,
  RunRetentionPurgeArgs,
  RunRetentionPurgeResult,
} from "./server/retention.js";
export {
  assertValidRetention,
  DEFAULT_RETENTION,
  runRetentionPurge,
} from "./server/retention.js";
export { sqlite } from "./server/storage-sqlite.js";

// Declaration-merge contribution. Declared optional so consumers that
// don't install the plugin can still write `ctx.audit?.log(...)` and
// have it compile + no-op at runtime. The augmentation is picked up
// automatically when any module imports from `@plumix/plugin-audit-log`.
declare module "plumix/plugin" {
  interface AppContextExtensions {
    readonly audit?: AuditExtension;
  }
}

export interface AuditLogPluginOptions {
  /**
   * Storage seam. Defaults to `sqlite()` writing to `ctx.db`. A
   * deploy can swap in a separate database / external sink (Tinybird,
   * BigQuery, ...) without touching the plugin's write pipeline.
   */
  readonly storage?: AuditLogStorage;
  /**
   * How long rows are kept. Defaults to `{ maxAgeDays: 90 }`. Pass
   * `retention: false` to keep rows forever. Triggering the purge is
   * a separate concern — call `runRetentionPurge(ctx, ...)` from your
   * ops script or a scheduled handler.
   */
  readonly retention?: AuditLogRetentionConfig;
}

const ADMIN_ENTRY_PATH =
  "node_modules/@plumix/plugin-audit-log/dist/admin/index.js";

const AUDIT_LOG_READ_CAPABILITY = "audit_log:read";

/**
 * `@plumix/plugin-audit-log` — captures lifecycle events to a queryable
 * activity feed. v0.1 covers entry events; #179+ add user, term, and
 * settings hooks plus the public `ctx.audit.log()` API for third-party
 * plugins.
 *
 * Architectural seams:
 *
 * - **Storage** is pluggable via the `storage` option. The default
 *   `sqlite()` writes to `ctx.db` against the plugin's own Drizzle
 *   table; the schema is forwarded into `definePlugin({ schema })` so
 *   `plumix migrate generate` picks up the table on the next codegen
 *   run.
 * - **Service** buffers per-request via a WeakMap keyed by AppContext
 *   and flushes once via `ctx.defer` (the runtime shim from #177).
 *   Multiple events from one RPC become one INSERT.
 * - **Hooks** subscribe to entry lifecycle events; each listener
 *   pulls AppContext out of `requestStore.getStore()` so action
 *   handlers (which don't take a ctx arg) can still find the per-
 *   request batch.
 * - **RPC** `auditLog.list` is gated on the `audit_log:read`
 *   capability (admin-only by default); slice #180 adds filter +
 *   cursor pagination.
 * - **Public API** `ctx.audit.log({ event, subject, properties })`
 *   from #181 — third-party plugins emit their own events through
 *   the same buffered flush. Drops the call when `ctx.user` is null
 *   so frontend / anonymous events can't leak into the admin feed.
 *
 * Example — a comments plugin records moderation actions:
 *
 *     definePlugin("comments", {
 *       setup: (ctx) => {
 *         ctx.addAction("comment:approved", (comment) => {
 *           // `tryGetContext()` returns the current AppContext, which
 *           // carries `ctx.audit` when the audit-log plugin is also
 *           // installed; the optional chain makes this a no-op when
 *           // it isn't.
 *           tryGetContext()?.audit?.log({
 *             event: "comment:approved",
 *             subject: { type: "comment", id: comment.id, label: comment.body.slice(0, 40) },
 *             properties: { postId: comment.postId },
 *           });
 *         });
 *       },
 *     });
 */
export function auditLog(options: AuditLogPluginOptions = {}) {
  const storage = options.storage ?? sqlite();
  const retention = options.retention ?? DEFAULT_RETENTION;
  // Fail fast on misconfigured retention — see assertValidRetention.
  assertValidRetention(retention);
  const service = createAuditService(storage);
  const router = createAuditLogRouter(storage);
  const extension = createAuditExtension(service);

  return definePlugin("audit_log", {
    adminEntry: ADMIN_ENTRY_PATH,
    schema: storage.schemaModule ?? schema,
    provides: (ctx) => {
      ctx.extendAppContext("audit", extension);
    },
    setup: (ctx) => {
      ctx.registerCapability(AUDIT_LOG_READ_CAPABILITY, "admin");

      ctx.registerRpcRouter(router);

      registerHooks(ctx, service);

      ctx.registerAdminPage({
        path: "/audit-log",
        title: "Audit log",
        capability: AUDIT_LOG_READ_CAPABILITY,
        nav: {
          group: { id: "tools", label: "Tools", priority: 600 },
          label: "Audit log",
          order: 10,
        },
        component: "AuditLogShell",
      });

      if (retention !== false) {
        ctx.registerScheduledTask({
          id: "retention-purge",
          cron: retention.purgeAt ?? DEFAULT_PURGE_CRON,
          handler: async (appCtx) => {
            const result = await runRetentionPurge(appCtx, {
              storage,
              retention,
            });
            appCtx.logger.info(
              `[plumix/plugin-audit-log] retention purge deleted ${result.deleted} row${
                result.deleted === 1 ? "" : "s"
              }`,
            );
          },
        });
      }
    },
  });
}
