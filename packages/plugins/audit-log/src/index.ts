import { definePlugin } from "@plumix/core";

import type { AuditLogStorage } from "./types.js";
import * as schema from "./db/schema.js";
import { createAuditLogRouter } from "./rpc.js";
import { createAuditService } from "./server/auditService.js";
import { registerHooks } from "./server/hooks.js";
import { sqlite } from "./server/storage-sqlite.js";

export type {
  AuditLogStorage,
  AuditLogRow,
  AuditLogQueryFilter,
} from "./types.js";
export { sqlite } from "./server/storage-sqlite.js";

export interface AuditLogPluginOptions {
  /**
   * Storage seam. Defaults to `sqlite()` writing to `ctx.db`. A
   * deploy can swap in a separate database / external sink (Tinybird,
   * BigQuery, ...) without touching the plugin's write pipeline.
   */
  readonly storage?: AuditLogStorage;
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
 */
export function auditLog(options: AuditLogPluginOptions = {}) {
  const storage = options.storage ?? sqlite();
  const service = createAuditService(storage);
  const router = createAuditLogRouter(storage);

  return definePlugin("audit_log", {
    adminEntry: ADMIN_ENTRY_PATH,
    schema: storage.schemaModule ?? schema,
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
    },
  });
}
