import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  CLOUDFLARE_E2E,
  runtimePackage,
  usePlaygrounds,
} from "./playground-fixture.js";
import { readRuntimeE2E, resolvePlaygroundDbPath } from "./runtime-e2e.js";

const playground = usePlaygrounds();

const MINIFLARE_D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

describe("readRuntimeE2E", () => {
  test("reads the e2e block off the runtime package the playground depends on", async () => {
    const cwd = await playground([
      { name: "plumix" },
      { name: "@plumix/plugin-blog", plumix: { scaffold: { kind: "plugin" } } },
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
    ]);

    expect(readRuntimeE2E(cwd)).toEqual({
      packageName: "@plumix/runtime-cloudflare",
      ...CLOUDFLARE_E2E,
    });
  });

  test("names the runtime package when it declares no e2e block", async () => {
    const cwd = await playground([runtimePackage("@plumix/runtime-node")]);

    expect(() => readRuntimeE2E(cwd)).toThrow(
      /@plumix\/runtime-node declares no "plumix\.e2e" block/,
    );
  });

  test("fails when no dependency is a runtime, pointing at the playground", async () => {
    const cwd = await playground([{ name: "plumix" }]);

    expect(() => readRuntimeE2E(cwd)).toThrow(
      new RegExp(`no runtime package among the dependencies of ${cwd}`),
    );
  });

  test("refuses two runtimes rather than picking one", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
      runtimePackage("@plumix/runtime-node", {
        wipe: ["data"],
        database: { glob: "data/plumix.sqlite" },
      }),
    ]);

    expect(() => readRuntimeE2E(cwd)).toThrow(
      /2 runtime packages.*@plumix\/runtime-cloudflare.*@plumix\/runtime-node/,
    );
  });
});

describe("resolvePlaygroundDbPath", () => {
  test("resolves the one file the block's glob names, skipping excluded names", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
    ]);
    const stateDir = join(cwd, MINIFLARE_D1_DIR);
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "abc123.sqlite"), "");
    await writeFile(join(stateDir, "metadata.sqlite"), "");

    expect(resolvePlaygroundDbPath(cwd)).toBe(join(stateDir, "abc123.sqlite"));
  });

  test("a literal path is its own glob", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-node", {
        wipe: ["data"],
        database: { glob: "data/plumix.sqlite" },
      }),
    ]);
    await mkdir(join(cwd, "data"), { recursive: true });
    await writeFile(join(cwd, "data/plumix.sqlite"), "");

    expect(resolvePlaygroundDbPath(cwd)).toBe(join(cwd, "data/plumix.sqlite"));
  });

  test("fails readably before the database exists", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
    ]);

    expect(() => resolvePlaygroundDbPath(cwd)).toThrow(
      /no database matches .*miniflare-D1DatabaseObject\/\*\.sqlite.*@plumix\/runtime-cloudflare.*plumix migrate apply/,
    );
  });

  test("refuses to pick between several matches", async () => {
    const cwd = await playground([
      runtimePackage("@plumix/runtime-cloudflare", CLOUDFLARE_E2E),
    ]);
    const stateDir = join(cwd, MINIFLARE_D1_DIR);
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "one.sqlite"), "");
    await writeFile(join(stateDir, "two.sqlite"), "");

    expect(() => resolvePlaygroundDbPath(cwd)).toThrow(
      /2 files match.*one\.sqlite.*two\.sqlite/,
    );
  });
});
