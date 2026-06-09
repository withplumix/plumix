import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { syncTemplate } from "./sync-template.js";
import { packageVersion, REPO_ROOT } from "./test-support.js";

const SOURCE = join(REPO_ROOT, "examples", "minimal");

describe("syncTemplate", () => {
  let dest: string;

  beforeEach(() => {
    dest = mkdtempSync(join(tmpdir(), "plumix-sync-test-"));
  });

  afterEach(() => {
    rmSync(dest, { recursive: true, force: true });
  });

  test("bakes a snapshot whose package.json carries no pnpm protocols", async () => {
    await syncTemplate({ source: SOURCE, dest, repoRoot: REPO_ROOT });

    const pkg = JSON.parse(
      readFileSync(join(dest, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [name, range] of Object.entries(allDeps)) {
      expect(range, `dep ${name}`).not.toMatch(/^(workspace|catalog):/);
    }
    expect(pkg.dependencies?.plumix).toBe(
      `^${packageVersion("packages/plumix")}`,
    );
    expect(pkg.devDependencies?.["@plumix/typescript-config"]).toBeUndefined();
  });
});
