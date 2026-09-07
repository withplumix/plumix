// PROTOTYPE — throwaway. The real roster: two core tasks, three plugin ones,
// one of which (search) declares no cron and so runs on every firing.
export const tasks = [
  { id: "session-cleanup", cron: "0 3 * * *", registeredBy: "core" },
  { id: "publish-scheduled", cron: "*/5 * * * *", registeredBy: "core" },
  { id: "retention-purge", cron: "30 4 * * *", registeredBy: "audit-log" },
  { id: "retention-purge", cron: "15 4 * * *", registeredBy: "forms" },
  { id: "index-drain", registeredBy: "search" },
];

/** Core's matching rule, verbatim from packages/core/src/runtime/scheduled.ts. */
export function tasksFor(firedCron) {
  return tasks.filter(
    (t) => firedCron === undefined || t.cron === undefined || t.cron === firedCron,
  );
}
