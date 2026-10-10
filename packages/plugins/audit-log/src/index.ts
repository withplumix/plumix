import type { Label } from "plumix/i18n";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

import type { AuditExtension } from "./server/auditExtension.js";
import type { AuditLogRetentionConfig } from "./server/retention.js";
import type { AuditLogStorage } from "./types.js";
import { createAuditLogRouter } from "./rpc.js";
import { registerAuditEvents } from "./server/auditEvents.js";
import { createAuditExtension } from "./server/auditExtension.js";
import { createAuditService } from "./server/auditService.js";
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
export { DEFAULT_RETENTION, runRetentionPurge } from "./server/retention.js";
export { sqlite } from "./server/storage-sqlite.js";

// Optional so `ctx.audit?.log(...)` compiles and no-ops where the plugin isn't
// installed.
declare module "plumix" {
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
   * Defaults to `{ maxAgeDays: 90 }`, purged daily at 03:00 UTC unless
   * `purgeAt` says otherwise. `false` keeps rows forever and registers no task.
   */
  readonly retention?: AuditLogRetentionConfig;
}

const ADMIN_ENTRY_PATH = pluginAdminEntryPath("@plumix/plugin-audit-log");

const AUDIT_LOG_READ_CAPABILITY = "audit_log:read";

/**
 * Plain descriptor literals — plugin source runs server-side without
 * the Babel macro pipeline; the manifest payload is identical to a
 * `defineMessage(...)` call. Catalogs ship under #697.
 */
const AUDIT_LABELS = {
  auditLog: { id: "plugin.auditLog.adminPage.title", message: "Audit log" },
  tools: { id: "core.adminNav.tools", message: "Tools" },
} satisfies Record<string, Label>;

/**
 * Records lifecycle events to an activity feed. A request's events are
 * buffered and written in one insert after the response, via `ctx.defer`.
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
    i18n: PLUGIN_I18N_SLOT,
    schema: storage.schema?.module,
    schemaModule: storage.schema?.specifier,
    provides: (ctx) => {
      ctx.extendAppContext("audit", extension);
    },
    setup: (ctx) => {
      ctx.registerCapability(AUDIT_LOG_READ_CAPABILITY, "admin");

      ctx.registerRpcRouter(router);

      registerAuditEvents(ctx, service);

      ctx.registerAdminPage({
        path: "/audit-log",
        title: AUDIT_LABELS.auditLog,
        capability: AUDIT_LOG_READ_CAPABILITY,
        nav: {
          group: { id: "tools", label: AUDIT_LABELS.tools, priority: 600 },
          label: AUDIT_LABELS.auditLog,
          order: 10,
          keywords: [
            { id: "plugin.auditLog.keyword.history", message: "history" },
            { id: "plugin.auditLog.keyword.activity", message: "activity" },
            { id: "plugin.auditLog.keyword.events", message: "events" },
            { id: "plugin.auditLog.keyword.log", message: "log" },
            { id: "plugin.auditLog.keyword.security", message: "security" },
          ],
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
