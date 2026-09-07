// PROTOTYPE — throwaway. One replica in the race: acquires the lease (or the
// no-op control lock), records the interval it "ran" for, repeats.
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { sqliteLease } from "./lease.mjs";

const [, , dbPath, holder, mode, roundsRaw, workMsRaw] = process.argv;
const rounds = Number(roundsRaw);
const workMs = Number(workMsRaw);

const noopLock = {
  async run(_key, fn) {
    await fn();
    return "ran";
  },
};

const lock =
  mode === "lease"
    ? sqliteLease({ path: dbPath, holder, ttlMs: 300 })
    : noopLock;

const journal = new DatabaseSync(dbPath);
journal.exec("PRAGMA journal_mode = WAL;");
journal.exec("PRAGMA busy_timeout = 5000;");
const record = journal.prepare(
  "INSERT INTO runs (holder, started_at, ended_at) VALUES (?, ?, ?)",
);

let held = 0;
for (let i = 0; i < rounds; i++) {
  const outcome = await lock.run("scheduled", async () => {
    const startedAt = performance.timeOrigin + performance.now();
    // A run longer than the 300ms TTL: the heartbeat has to keep it alive.
    await sleep(workMs);
    record.run(holder, startedAt, performance.timeOrigin + performance.now());
  });
  if (outcome === "held") held++;
  await sleep(5);
}
journal.close();
lock.close?.();
console.log(JSON.stringify({ holder, held }));
