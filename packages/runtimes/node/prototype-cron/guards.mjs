// PROTOTYPE — throwaway. The decisive experiment: which guard actually holds?
//
// Two DIFFERENT guarantees are in play, and conflating them is the trap:
//   P1  at most one run per (schedule, minute), across every replica
//   P2  no two runs overlap in time, across every replica
// The issue's AC asks for P2. P1 is the cheaper, crash-proof half of it.
//
// Guards (they compose):
//   serial  in-process: one run at a time inside this process
//   claim   a row recording the last (schedule, minute) fired — atomic, no TTL
//   lease   a row holding an expiry, renewed by a heartbeat while running
//
// Every case runs REAL processes against a REAL SQLite file.
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";

const dir = mkdtempSync(join(tmpdir(), "plumix-cron-guards-"));
const CHILD = new URL("guard-child.mjs", import.meta.url).pathname;
const MINUTE_MS = 300;

const title = (t) => console.log(`\n${t}\n${"=".repeat(t.length)}`);
const row = (label, verdict, detail) =>
  console.log(`  ${label.padEnd(22)} ${verdict.padEnd(6)} ${detail}`);

let n = 0;
function fresh() {
  const path = join(dir, `db-${String(n++)}.sqlite`);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE runs (holder TEXT, minute INTEGER, started_at REAL, ended_at REAL) STRICT;
    CREATE TABLE claims (schedule TEXT PRIMARY KEY, last_minute INTEGER NOT NULL) STRICT;
    CREATE TABLE leases (key TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT;
  `);
  db.close();
  return path;
}

function spawn(path, guards, holder, { ticks = 1, ttl = 300, work = 200, block = 0, epoch }) {
  let settle;
  const done = new Promise((r) => (settle = r));
  const child = execFile(
    "node",
    [CHILD, path, guards, holder, String(ticks), String(ttl), String(work), String(block), String(epoch)],
    (error, stdout, stderr) => settle({ error, out: stdout.trim(), err: stderr.trim() }),
  );
  return { child, done };
}

function inspect(path) {
  const db = new DatabaseSync(path);
  const rows = db
    .prepare("SELECT holder, minute, started_at, ended_at FROM runs ORDER BY started_at")
    .all();
  db.close();
  let overlaps = 0;
  const seen = new Set();
  let dupMinutes = 0;
  for (const [i, r] of rows.entries()) {
    if (i > 0 && r.started_at < rows[i - 1].ended_at) overlaps++;
    if (seen.has(r.minute)) dupMinutes++;
    seen.add(r.minute);
  }
  return { rows, overlaps, dupMinutes };
}

const COMBOS = [
  ["serial", "serial"],
  ["serial+claim", "serial,claim"],
  ["serial+lease", "serial,lease"],
  ["serial+claim+lease", "serial,claim,lease"],
];

const report = (label, r) => {
  const errs = r.errors?.filter(Boolean) ?? [];
  return errs.length > 0 ? `child crashed: ${errs[0]}` : label;
};

// ── A: two replicas, same minute ────────────────────────────────────────────
title("A — two replicas reach the SAME minute together   (tests P1)");
for (const [label, guards] of COMBOS) {
  const path = fresh();
  const epoch = Date.now();
  const results = await Promise.all(
    [0, 1].map((i) => spawn(path, guards, `replica-${String(i)}`, { work: 400, epoch }).done),
  );
  const { rows } = inspect(path);
  const errs = results.map((r) => (r.error ? r.err.split("\n").slice(-1)[0] : null)).filter(Boolean);
  row(
    label,
    rows.length === 1 ? "PASS" : "FAIL",
    errs.length > 0 ? `child crashed: ${errs[0]}` : `${String(rows.length)} run(s), want 1`,
  );
}

// ── B: one replica, a run longer than its own schedule ──────────────────────
title("B — ONE replica, run spans 3 minutes, ticks keep arriving   (tests P2, self)");
for (const [label, guards] of COMBOS) {
  const path = fresh();
  const r = await spawn(path, guards, "solo", {
    ticks: 4,
    work: MINUTE_MS * 3,
    epoch: Date.now(),
  }).done;
  const { rows, overlaps } = inspect(path);
  row(
    label,
    overlaps === 0 ? "PASS" : "FAIL",
    r.error
      ? `child crashed: ${r.err.split("\n").slice(-1)[0]}`
      : `${String(rows.length)} run(s), ${String(overlaps)} overlap(s)  [${r.out}]`,
  );
}

// ── C: two replicas, a slow run spanning into the next minute ───────────────
title("C — replica A still running minute 0 when replica B ticks minute 1   (tests P2, cross-process)");
for (const [label, guards] of COMBOS) {
  const path = fresh();
  const epoch = Date.now();
  const a = spawn(path, guards, "A", { work: MINUTE_MS * 3, epoch });
  await sleep(MINUTE_MS + 30); // B arrives a minute later, while A still works
  const b = await spawn(path, guards, "B", { work: 150, epoch }).done;
  await a.done;
  const { rows, overlaps } = inspect(path);
  row(
    label,
    overlaps === 0 ? "PASS" : "FAIL",
    `${String(rows.length)} run(s), ${String(overlaps)} overlap(s)  B said "${b.out || b.err.split("\n").slice(-1)[0]}"`,
  );
}

// ── D: the holder is SIGKILLed mid-run ──────────────────────────────────────
title("D — holder SIGKILLed mid-run; is the guard permanently stuck?");
for (const [label, guards] of COMBOS) {
  const path = fresh();
  const epoch = Date.now();
  const victim = spawn(path, guards, "victim", { work: 10_000, epoch });
  await sleep(200);
  victim.child.kill("SIGKILL");
  await sleep(100);
  // A later minute, so the claim row is not the thing blocking recovery.
  const soon = await spawn(path, guards, "successor", { work: 100, epoch: epoch - MINUTE_MS * 2 }).done;
  await sleep(400); // past the 300ms lease TTL
  const later = await spawn(path, guards, "successor", { work: 100, epoch: epoch - MINUTE_MS * 4 }).done;
  row(label, later.out.includes("ran") ? "PASS" : "FAIL", `right after kill: "${soon.out}"   after TTL: "${later.out}"`);
}

// ── E: the holder blocks the event loop past the lease TTL ──────────────────
title("E — holder BLOCKS the event loop 900ms, lease TTL 300ms (synchronous node:sqlite)");
for (const [label, guards] of COMBOS) {
  const path = fresh();
  const epoch = Date.now();
  const blocker = spawn(path, guards, "blocker", { work: 900, block: 1, ttl: 300, epoch });
  await sleep(500);
  // A LATER minute, so only the lease can stop this: the claim row cannot.
  const thief = await spawn(path, guards, "thief", { work: 300, ttl: 300, epoch: epoch - MINUTE_MS * 3 }).done;
  await blocker.done;
  const { rows, overlaps } = inspect(path);
  row(
    label,
    overlaps === 0 ? "PASS" : "FAIL",
    `${String(rows.length)} run(s), ${String(overlaps)} overlap(s)  thief said "${thief.out}"`,
  );
}


// ── E2: the same block, with a TTL sized above it ───────────────────────────
{
  const t = "E2 — same 900ms block, lease TTL raised to 5s";
  console.log(`\n${t}\n${"=".repeat(t.length)}`);
  for (const [label, guards] of COMBOS) {
    const path = fresh();
    const epoch = Date.now();
    const blocker = spawn(path, guards, "blocker", { work: 900, block: 1, ttl: 5000, epoch });
    await sleep(500);
    const thief = await spawn(path, guards, "thief", { work: 300, ttl: 5000, epoch: epoch - MINUTE_MS * 3 }).done;
    await blocker.done;
    const { rows, overlaps } = inspect(path);
    row(
      label,
      overlaps === 0 ? "PASS" : "FAIL",
      `${String(rows.length)} run(s), ${String(overlaps)} overlap(s)  thief said "${thief.out}"`,
    );
  }
  console.log("");
}
