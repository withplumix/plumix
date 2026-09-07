// PROTOTYPE — throwaway. Two hazards a long-term answer has to survive:
//   1. the lease holder is SIGKILLed  -> another process must take over
//   2. the lease holder blocks the event loop (node:sqlite is SYNCHRONOUS, so
//      a long DELETE does exactly this) -> the heartbeat cannot fire, and a
//      TTL-based lease can be stolen mid-run
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as sleep } from "node:timers/promises";
import { sqliteLease } from "./lease.mjs";

const dir = mkdtempSync(join(tmpdir(), "plumix-cron-block-"));
const title = (t) => console.log(`\n${t}\n${"-".repeat(t.length)}`);

function fresh(name) {
  const path = join(dir, `${name}.sqlite`);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.close();
  return path;
}

// -- 1. Holder is SIGKILLed --------------------------------------------------
title("Holder killed mid-run (TTL 400ms)");
{
  const path = fresh("kill");
  const child = execFile("node", ["-e", `
    import("${new URL("lease.mjs", import.meta.url).pathname}").then(async (m) => {
      const lock = m.sqliteLease({ path: ${JSON.stringify(path)}, holder: "victim", ttlMs: 400 });
      await lock.run("scheduled", () => new Promise(() => {}));
    });
  `]);
  await sleep(500);
  const survivor = sqliteLease({ path, holder: "survivor", ttlMs: 400 });
  console.log(`  while victim holds it: ${await survivor.run("scheduled", async () => {})}  (expected "held")`);
  child.kill("SIGKILL");
  await sleep(150);
  console.log(`  immediately after SIGKILL: ${await survivor.run("scheduled", async () => {})}  (stale row, still inside TTL)`);
  await sleep(450);
  console.log(`  after the TTL lapses:      ${await survivor.run("scheduled", async () => {})}  (expected "ran")`);
  survivor.close();
}

// -- 2. Holder blocks the event loop -----------------------------------------
title("Holder blocks the event loop for 900ms with a 400ms TTL");
{
  const path = fresh("block");
  const holder = sqliteLease({ path, holder: "blocker", ttlMs: 400 });
  const thief = sqliteLease({ path, holder: "thief", ttlMs: 400 });
  let stolen = "not attempted";
  const run = holder.run("scheduled", async () => {
    // Exactly what a synchronous node:sqlite DELETE over many rows does.
    const until = Date.now() + 900;
    while (Date.now() < until) {
      /* spin: the heartbeat interval cannot fire */
    }
  });
  // The thief runs in THIS process too, so it only gets a turn once the
  // blocker yields; use a child process to attempt the steal concurrently.
  const { promise, resolve } = Promise.withResolvers();
  execFile(
    "node",
    ["-e", `
      import("${new URL("lease.mjs", import.meta.url).pathname}").then(async (m) => {
        await new Promise((r) => setTimeout(r, 500));
        const lock = m.sqliteLease({ path: ${JSON.stringify(path)}, holder: "thief", ttlMs: 400 });
        console.log(await lock.run("scheduled", async () => {}));
        lock.close();
      });
    `],
    (_e, stdout) => { stolen = stdout.trim(); resolve(); },
  );
  await run;
  await promise;
  thief.close();
  holder.close();
  console.log(`  thief's verdict 500ms into a 900ms blocking run: "${stolen}"`);
  console.log(`  "ran" here means the lease was STOLEN mid-run -> a real overlap.`);
}

rmSync(dir, { recursive: true, force: true });
console.log("");
