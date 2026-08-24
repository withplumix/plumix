import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "./load-config.js";

// A valid PlumixConfig (passes isPlumixConfig) that bumps a global counter
// every time the module is evaluated. With jiti's `moduleCache: false`, each
// real load re-executes the module body — so the counter tells us exactly how
// many times the config was evaluated vs. served from cache.
const FIXTURE = `
(globalThis as unknown as Record<string, number>).__plumixEvalCount =
  ((globalThis as unknown as Record<string, number>).__plumixEvalCount ?? 0) + 1;
export default {
  runtime: { name: "test", buildFetchHandler: () => () => new Response() },
  database: { kind: "d1" },
  auth: { passkey: {} },
};
`;

const evalStore = globalThis as unknown as { __plumixEvalCount?: number };

function evalCount(): number {
  return evalStore.__plumixEvalCount ?? 0;
}

// A fresh temp dir per call gives each test a unique config path, so the
// module-level cache in load-config.ts never collides across tests (it is keyed
// by absolute path and intentionally has no reset hook).
function writeFixtureDir(body = FIXTURE): string {
  const dir = mkdtempSync(join(tmpdir(), "plumix-loadconfig-"));
  writeFileSync(join(dir, "plumix.config.ts"), body);
  return dir;
}

afterEach(() => {
  evalStore.__plumixEvalCount = 0;
});

describe("loadConfig", () => {
  test("evaluates the config once, then serves cold-start callers from cache", async () => {
    const dir = writeFixtureDir();

    const first = await loadConfig(dir);
    const second = await loadConfig(dir);

    // The fan-out across CLI + Vite hooks (#1102) collapses to one evaluation.
    expect(evalCount()).toBe(1);
    expect(second.config).toBe(first.config);
  });

  test("`fresh` re-evaluates and refreshes the cache for the watcher", async () => {
    const dir = writeFixtureDir();

    await loadConfig(dir); // cold start → eval 1
    const refreshed = await loadConfig(dir, undefined, { fresh: true }); // eval 2
    const afterRefresh = await loadConfig(dir); // cache hit, no eval

    expect(evalCount()).toBe(2);
    // The forced-fresh result is what later cold reads now see.
    expect(afterRefresh.config).toBe(refreshed.config);
  });

  // Each slot the shape check reads, dropped one at a time. A config module
  // that loads and evaluates cleanly but is not a config has to be rejected
  // here rather than reaching the runtime as one.
  test.each([
    ["runtime missing", `{ database: { kind: "d1" }, auth: { passkey: {} } }`],
    [
      "runtime.buildFetchHandler not callable",
      `{ runtime: { name: "test", buildFetchHandler: "no" },
         database: { kind: "d1" }, auth: { passkey: {} } }`,
    ],
    [
      "database.kind missing",
      `{ runtime: { name: "test", buildFetchHandler: () => () => new Response() },
         database: {}, auth: { passkey: {} } }`,
    ],
    [
      "auth.passkey falsy",
      `{ runtime: { name: "test", buildFetchHandler: () => () => new Response() },
         database: { kind: "d1" }, auth: { passkey: null } }`,
    ],
    ["not an object at all", `"plumix"`],
  ])("rejects a config whose %s", async (_name, body) => {
    const dir = writeFixtureDir(`export default ${body};`);

    await expect(loadConfig(dir)).rejects.toThrow(/Invalid config shape/);
  });

  test("caches per resolved config path", async () => {
    const a = writeFixtureDir();
    const b = writeFixtureDir();

    await loadConfig(a);
    await loadConfig(b);
    await loadConfig(a);

    // Distinct paths each evaluate once; the repeat of `a` is cached.
    expect(evalCount()).toBe(2);
  });
});
