// PROTOTYPE — throwaway. `node run.mjs <scenario>`; no arg lists them.
import { parseCron } from "./cron-match.mjs";
import { createVirtualClock } from "./clock.mjs";
import { createScheduler, inProcessLock } from "./scheduler.mjs";
import { tasks, tasksFor } from "./fake-app.mjs";

const log = (...a) => console.log(...a);
const hr = (title) => log(`\n${title}\n${"-".repeat(title.length)}`);

const scenarios = {};

// -- 1. What the scheduler derives from the built app ------------------------
scenarios.derive = async () => {
  hr("Schedules derived from app.scheduledTasks");
  const byCron = new Map();
  for (const t of tasks) {
    const key = t.cron ?? "(none - fires on every run)";
    byCron.set(key, [...(byCron.get(key) ?? []), `${t.registeredBy}:${t.id}`]);
  }
  for (const [cron, ids] of byCron)
    log(`  ${cron.padEnd(28)} ${ids.join(", ")}`);
  const distinct = [...new Set(tasks.filter((t) => t.cron).map((t) => t.cron))];
  log(`\n  distinct schedules the loop must fire: ${distinct.join("  ")}`);
  hr("Which tasks each firing runs (core's matcher)");
  for (const cron of distinct) {
    const ids = tasksFor(cron).map((t) => `${t.registeredBy}:${t.id}`);
    log(`  fire ${cron.padEnd(14)} -> ${ids.join(", ")}`);
  }
  log(
    `\n  note: search:index-drain has no cron, so it runs on ALL ${String(distinct.length)} firings.`,
  );
};

// -- 2. Cron matcher correctness --------------------------------------------
scenarios.cron = async () => {
  hr("Matcher - accepted");
  const cases = [
    ["*/5 * * * *", "2026-09-07T04:05:00Z", true],
    ["*/5 * * * *", "2026-09-07T04:06:00Z", false],
    ["0 3 * * *", "2026-09-07T03:00:00Z", true],
    ["0 3 * * *", "2026-09-07T03:01:00Z", false],
    ["30 4 * * *", "2026-09-07T04:30:00Z", true],
    ["0 0 1 * *", "2026-10-01T00:00:00Z", true],
    ["0 0 * * 0", "2026-09-06T00:00:00Z", true], // Sunday
    ["0 0 * * 7", "2026-09-06T00:00:00Z", true], // 7 is Sunday too
    ["0 0 1 * 1", "2026-09-07T00:00:00Z", true], // dom+dow restricted -> OR
    ["0 0 1 * 1", "2026-09-01T00:00:00Z", true],
    ["0 0 1 * 1", "2026-09-02T00:00:00Z", false],
    ["15,45 * * * *", "2026-09-07T09:45:00Z", true],
    ["0 9-17/4 * * 1-5", "2026-09-07T13:00:00Z", true],
    ["0 0 1 jan sun", "2027-01-01T00:00:00Z", true],
  ];
  let bad = 0;
  for (const [expr, iso, want] of cases) {
    const got = parseCron(expr).matches(new Date(iso));
    if (got !== want) bad++;
    log(
      `  ${got === want ? "ok  " : "FAIL"} ${expr.padEnd(18)} @ ${iso} -> ${String(got)}`,
    );
  }
  hr("Matcher - rejected at boot (loud, not silent)");
  for (const expr of [
    "*/5 * * *",
    "0 3 * * * *",
    "@daily",
    "0 99 * * *",
    "0 0 L * *",
    "*/0 * * * *",
    "5-1 * * * *",
  ]) {
    try {
      parseCron(expr);
      log(`  FAIL ${expr.padEnd(18)} accepted - should have thrown`);
      bad++;
    } catch (e) {
      log(`  ok   ${expr.padEnd(18)} ${e.message}`);
    }
  }
  log(bad === 0 ? "\n  all cases pass" : `\n  ${String(bad)} FAILURES`);
};

// -- 3. A simulated day through the in-process loop --------------------------
scenarios.day = async () => {
  hr("VARIANT A - in-process tick loop, one simulated UTC day");
  const clock = createVirtualClock("2026-09-07T02:58:00Z");
  const fired = [];
  const sched = createScheduler({
    tasks,
    clock,
    lock: inProcessLock(),
    log: (m) => log(`    ${m}`),
    fire: async (cron, at) => {
      const ran = tasksFor(cron).map((t) => `${t.registeredBy}:${t.id}`);
      fired.push({ at, cron, ran });
      await clock.sleep(200); // a task run costs a moment
    },
  });
  void sched.start();
  await clock.runUntil("2026-09-08T02:58:00Z");
  await sched.stop();
  const counts = {};
  for (const f of fired)
    for (const id of f.ran) counts[id] = (counts[id] ?? 0) + 1;
  for (const f of fired.slice(0, 6))
    log(
      `  ${new Date(f.at).toISOString()}  ${f.cron.padEnd(12)} -> ${String(f.ran.length)} task(s)`,
    );
  log(`  ... ${String(fired.length)} firings in 24h`);
  hr("Runs per task over the day");
  for (const [id, n] of Object.entries(counts))
    log(`  ${id.padEnd(26)} ${String(n)}`);
  log(
    `\n  expected: publish-scheduled 288, session-cleanup 1, forms 1, audit-log 1, index-drain 291`,
  );
};

// -- 4. Overlap: a task that outruns its own schedule ------------------------
scenarios.overlap = async () => {
  hr("A run that takes 12 minutes, on a 5-minute schedule");
  const clock = createVirtualClock("2026-09-07T00:00:00Z");
  const events = [];
  let depth = 0;
  let maxDepth = 0;
  const sched = createScheduler({
    tasks: [{ id: "slow", cron: "*/5 * * * *", registeredBy: "demo" }],
    clock,
    lock: inProcessLock(),
    log: (m) => events.push(`  ${m}`),
    fire: async (cron, at) => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
      events.push(
        `  start ${new Date(at).toISOString()}  (concurrent runs: ${String(depth)})`,
      );
      await clock.sleep(12 * 60_000);
      events.push(`  end   ${new Date(clock.now()).toISOString()}`);
      depth--;
    },
  });
  void sched.start();
  await clock.runUntil("2026-09-07T01:00:00Z");
  const stopping = sched.stop();
  await clock.runUntil("2026-09-07T02:00:00Z");
  await stopping;
  log(events.join("\n"));
  log(
    `\n  peak concurrency: ${String(maxDepth)} - an awaited loop cannot overlap ITSELF.`,
  );
  log(`  the cost is skipped minutes, reported above, not a double run.`);
};

// -- 5. Failure isolation + SIGTERM drain ------------------------------------
scenarios.drain = async () => {
  hr("A failing task does not stop its siblings");
  const clock = createVirtualClock("2026-09-07T00:04:00Z");
  const ran = [];
  const sched = createScheduler({
    tasks,
    clock,
    lock: inProcessLock(),
    log: (m) => log(`  ${m}`),
    fire: async (cron) => {
      for (const t of tasksFor(cron)) {
        try {
          if (t.id === "publish-scheduled") throw new Error("boom");
          ran.push(`${t.registeredBy}:${t.id}`);
        } catch (e) {
          log(`  task ${t.registeredBy}:${t.id} failed: ${e.message}`);
        }
      }
      await clock.sleep(30_000);
    },
  });
  void sched.start();
  await clock.runUntil("2026-09-07T00:05:10Z");
  log(`  siblings that still ran: ${ran.join(", ")}`);

  hr("SIGTERM mid-run: stop() waits for the run in flight");
  const before = clock.now();
  const stopping = sched.stop();
  await clock.runUntil("2026-09-07T00:06:00Z");
  await stopping;
  log(
    `  signalled at ${new Date(before).toISOString()}, returned at ${new Date(clock.now()).toISOString()}`,
  );
  log(`  the half-run task finished; the loop scheduled nothing further.`);
};

const name = process.argv[2];
if (!name || !(name in scenarios) || name === "all") {
  if (name !== "all") {
    log(`usage: node run.mjs <${Object.keys(scenarios).join("|")}|all>`);
    process.exit(name ? 1 : 0);
  }
}
for (const key of name === "all" ? Object.keys(scenarios) : [name])
  await scenarios[key]();
log("");
