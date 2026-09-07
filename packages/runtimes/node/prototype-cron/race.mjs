// PROTOTYPE — throwaway. `node race.mjs` — four real processes on one real
// SQLite file, with and without the lease. Answers: does a lease row actually
// hold across processes, and does anything overlap without one?
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const run = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), "plumix-cron-proto-"));
const REPLICAS = 4;
const ROUNDS = 6;
const WORK_MS = 400; // longer than the 300ms lease TTL, so the heartbeat matters

async function race(mode) {
  const dbPath = join(dir, `${mode}.sqlite`);
  const setup = new DatabaseSync(dbPath);
  setup.exec("PRAGMA journal_mode = WAL;");
  setup.exec(
    "CREATE TABLE runs (holder TEXT NOT NULL, started_at REAL NOT NULL, ended_at REAL NOT NULL) STRICT;",
  );
  setup.close();

  const held = await Promise.all(
    Array.from({ length: REPLICAS }, async (_, i) => {
      const { stdout } = await run("node", [
        new URL("racer.mjs", import.meta.url).pathname,
        dbPath,
        `replica-${String(i)}`,
        mode,
        String(ROUNDS),
        String(WORK_MS),
      ]);
      return JSON.parse(stdout).held;
    }),
  );

  const db = new DatabaseSync(dbPath);
  const runs = db
    .prepare("SELECT holder, started_at, ended_at FROM runs ORDER BY started_at")
    .all();
  db.close();

  const overlaps = [];
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].started_at < runs[i - 1].ended_at) {
      overlaps.push([runs[i - 1], runs[i]]);
    }
  }
  return { runs, overlaps, skipped: held.reduce((a, b) => a + b, 0) };
}

const title = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

title(`${String(REPLICAS)} processes x ${String(ROUNDS)} rounds, NO lock (control)`);
const none = await race("none");
console.log(`  runs recorded: ${String(none.runs.length)}`);
console.log(`  overlapping pairs: ${String(none.overlaps.length)}`);
for (const [a, b] of none.overlaps.slice(0, 3)) {
  console.log(
    `    ${a.holder} ended +${(a.ended_at - none.runs[0].started_at).toFixed(0)}ms, ${b.holder} had already started +${(b.started_at - none.runs[0].started_at).toFixed(0)}ms`,
  );
}

title(`Same, with the SQLite lease row (TTL 300ms, work ${String(WORK_MS)}ms)`);
const leased = await race("lease");
console.log(`  runs recorded: ${String(leased.runs.length)}`);
console.log(`  attempts that found the lease held and skipped: ${String(leased.skipped)}`);
console.log(`  overlapping pairs: ${String(leased.overlaps.length)}`);
for (const [a, b] of leased.overlaps.slice(0, 3)) {
  console.log(`    OVERLAP ${a.holder} / ${b.holder}`);
}
const gaps = leased.runs
  .slice(1)
  .map((r, i) => r.started_at - leased.runs[i].ended_at);
if (gaps.length > 0) {
  console.log(
    `  min gap between consecutive runs: ${Math.min(...gaps).toFixed(1)}ms`,
  );
}
console.log(
  `\n  verdict: lease holds across processes = ${String(leased.overlaps.length === 0)}; a run outliving its TTL was ${leased.overlaps.length === 0 ? "not" : "STILL"} stolen.`,
);

rmSync(dir, { recursive: true, force: true });
console.log("");
