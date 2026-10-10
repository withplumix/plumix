import { sqliteTable } from "drizzle-orm/sqlite-core";

/**
 * One conditional write per minute, so of two replicas exactly one wins.
 * Can't catch a run outliving its schedule; that is `scheduledTaskLeases`.
 */
export const scheduledTaskClaims = sqliteTable(
  "scheduled_task_claims",
  (t) => ({
    /**
     * The declared cron expression; a schedule is identified by what it says.
     */
    schedule: t.text().primaryKey(),
    /** Minutes since the epoch, so an ordinary `<` decides a claim. */
    lastMinute: t.integer().notNull(),
  }),
);

/**
 * `expiresAt` alone frees a dead holder's lease, so it is generous: on
 * `node:sqlite` a task blocking the event loop blocks its heartbeat too.
 */
export const scheduledTaskLeases = sqliteTable(
  "scheduled_task_leases",
  (t) => ({
    key: t.text().primaryKey(),
    /**
     * Identifies the run, not the process. Keyed on the process a lease would
     * be re-entrant, and a process whose firings overlap would take its own
     * lease twice.
     */
    token: t.text().notNull(),
    expiresAt: t.integer().notNull(),
  }),
);
