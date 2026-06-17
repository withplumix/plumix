import type { MutablePluginRegistry } from "../plugin/manifest.js";
import { pruneExpiredSessions } from "../auth/sessions.js";
import { publishDueScheduledEntries } from "../rpc/procedures/entry/publish-scheduled.js";

// Daily at 03:00 UTC. Only fires if the deploy declares a matching
// `triggers.crons` entry in wrangler config; otherwise expired sessions
// stay filtered-at-read and simply accumulate (harmless, just rows).
const SESSION_CLEANUP_CRON = "0 3 * * *";

// Every 5 minutes — the worst-case lag between an entry's scheduled time and
// its actual publish. Needs a matching `triggers.crons` entry to fire.
const PUBLISH_SCHEDULED_CRON = "*/5 * * * *";

/**
 * Register core's built-in scheduled tasks. Called at app boot before plugins
 * install, so their tasks join `app.scheduledTasks` alongside plugin ones.
 */
export function registerCoreScheduledTasks(
  registry: MutablePluginRegistry,
): void {
  registry.scheduledTasks.push({
    id: "session-cleanup",
    cron: SESSION_CLEANUP_CRON,
    registeredBy: "core",
    handler: async (ctx) => {
      const reaped = await pruneExpiredSessions(ctx.db);
      if (reaped > 0) {
        ctx.logger.info(
          `[plumix] session-cleanup reaped ${String(reaped)} expired session${
            reaped === 1 ? "" : "s"
          }`,
        );
      }
    },
  });

  registry.scheduledTasks.push({
    id: "publish-scheduled",
    cron: PUBLISH_SCHEDULED_CRON,
    registeredBy: "core",
    handler: async (ctx) => {
      const published = await publishDueScheduledEntries(ctx);
      if (published > 0) {
        ctx.logger.info(
          `[plumix] publish-scheduled published ${String(published)} entr${
            published === 1 ? "y" : "ies"
          }`,
        );
      }
    },
  });
}
