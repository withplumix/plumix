import type { MutablePluginRegistry } from "../plugin/manifest.js";
import { pruneExpiredSessions } from "../auth/sessions.js";

// Daily at 03:00 UTC. Only fires if the deploy declares a matching
// `triggers.crons` entry in wrangler config; otherwise expired sessions
// stay filtered-at-read and simply accumulate (harmless, just rows).
const SESSION_CLEANUP_CRON = "0 3 * * *";

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
}
