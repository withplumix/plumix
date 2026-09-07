// PROTOTYPE — throwaway. One replica for guards.mjs.
//
// Guards compose. `--guard` takes a comma-separated list of:
//   serial  in-process: one run at a time inside this process
//   claim   a row recording the last (schedule, minute) fired — atomic, no TTL
//   lease   a row holding an expiry, renewed by a heartbeat while running
//
// argv: <dbPath> <guards> <holder> <ticks> <ttlMs> <workMs> <block> <startMinute>
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";

const [, , dbPath, guardList, holder, ticksRaw, ttlRaw, workRaw, blockRaw, epochRaw] =
  process.argv;
const guards = new Set(guardList.split(","));
const ticks = Number(ticksRaw);
const ttlMs = Number(ttlRaw);
const workMs = Number(workRaw);
const blocking = blockRaw === "1";
// Every replica in a case is handed the same epoch, so they agree on which
// simulated minute it is. One simulated minute is 300ms.
const EPOCH = Number(epochRaw);
const MINUTE_MS = 300;
const minuteOf = (t) => Math.floor((t - EPOCH) / MINUTE_MS);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
const record = db.prepare(
  "INSERT INTO runs (holder, minute, started_at, ended_at) VALUES (?, ?, ?, ?)",
);

// -- claim: at most one run per (schedule, minute), across every replica ------
const claim = db.prepare(`
  INSERT INTO claims (schedule, last_minute) VALUES (?, ?)
  ON CONFLICT(schedule) DO UPDATE SET last_minute = excluded.last_minute
  WHERE claims.last_minute < excluded.last_minute
`);

// -- lease: no two runs overlap in time, across every replica -----------------
// The token is per RUN, not per process: keyed on the process the lease would
// be re-entrant, and a process whose ticks overlap would take its own lease
// twice. Crash recovery therefore rests on the TTL alone, which is the point.
const acquire = db.prepare(`
  INSERT INTO leases (key, token, expires_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
  WHERE leases.expires_at <= ?
`);
const heartbeat = db.prepare(
  "UPDATE leases SET expires_at = ? WHERE key = ? AND token = ?",
);
const release = db.prepare("DELETE FROM leases WHERE key = ? AND token = ?");

async function work(minute) {
  const startedAt = performance.timeOrigin + performance.now();
  if (blocking) {
    // Exactly what a synchronous node:sqlite DELETE over many rows does: no
    // timer in this process can fire, so no heartbeat can renew a lease.
    const until = Date.now() + workMs;
    while (Date.now() < until) {
      /* spin */
    }
  } else {
    await sleep(workMs);
  }
  record.run(holder, minute, startedAt, performance.timeOrigin + performance.now());
}

let busy = false;
let runSeq = 0;
const outcomes = [];

async function tick() {
  const minute = minuteOf(Date.now());

  if (guards.has("serial") && busy) return void outcomes.push("serial-held");
  if (guards.has("serial")) busy = true;
  try {
    if (guards.has("claim")) {
      const { changes } = claim.run("scheduled", minute);
      if (changes === 0) return void outcomes.push("claim-held");
    }
    let token;
    if (guards.has("lease")) {
      token = `${holder}:${String(runSeq++)}`;
      const now = Date.now();
      const { changes } = acquire.run("scheduled", token, now + ttlMs, now);
      if (changes === 0) return void outcomes.push("lease-held");
    }
    const beat =
      token === undefined
        ? undefined
        : setInterval(
            () => heartbeat.run(Date.now() + ttlMs, "scheduled", token),
            Math.max(1, Math.floor(ttlMs / 3)),
          );
    try {
      await work(minute);
      outcomes.push("ran");
    } finally {
      if (beat) clearInterval(beat);
      if (token !== undefined) release.run("scheduled", token);
    }
  } finally {
    if (guards.has("serial")) busy = false;
  }
}

// Ticks arrive on the clock, not after the previous run finishes — otherwise
// the firing loop is itself the guard and the comparison is rigged.
const inFlight = [];
for (let i = 0; i < ticks; i++) {
  inFlight.push(tick());
  if (i < ticks - 1) await sleep(MINUTE_MS);
}
await Promise.all(inFlight);

db.close();
console.log(outcomes.join(","));
