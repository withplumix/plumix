import { sqliteTable } from "drizzle-orm/sqlite-core";

/**
 * The last minute each schedule was fired for, one row per schedule.
 *
 * This is the crash-proof half of the no-overlap guarantee: the write that
 * advances `lastMinute` is a single conditional statement, so of two replicas
 * reaching the same minute exactly one wins it, and there is no expiry to
 * renew and nothing to clean up after a holder dies. What it cannot catch is a
 * run that outlives its own schedule — minute N+1 is a different row — which
 * is what `scheduledTaskLeases` is for.
 */
export const scheduledTaskClaims = sqliteTable(
  "scheduled_task_claims",
  (t) => ({
    /** The declared cron expression; a schedule is identified by what it says. */
    schedule: t.text().primaryKey(),
    /** Minutes since the epoch, so an ordinary `<` decides a claim. */
    lastMinute: t.integer().notNull(),
  }),
);

/**
 * The lease a scheduled run holds while it works, so a slow run on one replica
 * is not overlapped by the next firing on another.
 *
 * `expiresAt` is the only thing that frees a lease whose holder died, so it is
 * sized well above any plausible run rather than tightly: a heartbeat renews
 * it, but `node:sqlite` is synchronous, so a task that blocks the event loop
 * blocks its own heartbeat too. A generous expiry is what actually holds; the
 * heartbeat only shortens recovery for runs that legitimately run long.
 */
export const scheduledTaskLeases = sqliteTable(
  "scheduled_task_leases",
  (t) => ({
    key: t.text().primaryKey(),
    /**
     * Identifies the run, not the process. Keyed on the process a lease would be
     * re-entrant, and a process whose firings overlap would take its own lease
     * twice.
     */
    token: t.text().notNull(),
    expiresAt: t.integer().notNull(),
  }),
);
