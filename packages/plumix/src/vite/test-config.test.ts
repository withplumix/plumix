import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createVitest } from "vitest/node";

import { NODE_TIER } from "@plumix/vitest-config/tiers";

import { defineTestConfig } from "./test-config.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "plumix-test-config-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function layOut(files: readonly string[]): Promise<void> {
  for (const file of files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), "");
  }
}

/** Each test file Vitest would run, keyed by path, valued by project name. */
async function projectsOf(
  config: Awaited<ReturnType<ReturnType<typeof defineTestConfig>>>,
): Promise<Record<string, string>> {
  // As a config file would hand it over, not as CLI flags.
  const vitest = await createVitest(
    { root, config: false, watch: false },
    config,
  );
  try {
    const specs = await vitest.globTestSpecifications();
    return Object.fromEntries(
      specs.map((spec) => [
        relative(root, spec.moduleId).replaceAll("\\", "/"),
        spec.project.name,
      ]),
    );
  } finally {
    await vitest.close();
  }
}

describe("defineTestConfig", () => {
  test("runs src/ tests as the unit project and tests/feature/ as the feature project", async () => {
    await layOut([
      "src/sum.test.ts",
      "src/admin/card.test.tsx",
      "tests/feature/home.test.ts",
      "tests/feature/forms/submitting-a-form.test.tsx",
      "tests/e2e/home.spec.ts",
      "tests/support/site.ts",
    ]);

    expect(await projectsOf(await defineTestConfig()())).toEqual({
      "src/sum.test.ts": "unit",
      "src/admin/card.test.tsx": "unit",
      "tests/feature/home.test.ts": "feature",
      "tests/feature/forms/submitting-a-form.test.tsx": "feature",
    });
  });

  test("leaves out build tests, as this repo's tiers do", async () => {
    await layOut(["src/bundle.build.test.ts", "tests/feature/x.build.test.ts"]);

    expect(NODE_TIER.exclude).toEqual(["**/*.build.test.{ts,tsx}"]);
    expect(await projectsOf(await defineTestConfig()())).toEqual({});
  });

  test("merges overrides into both projects", async () => {
    await layOut([
      "src/sum.test.ts",
      "src/fixtures/broken.test.ts",
      "tests/feature/home.test.ts",
      "tests/feature/fixtures/broken.test.ts",
    ]);

    const config = await defineTestConfig({
      test: { setupFiles: ["./test/setup.ts"], exclude: ["**/fixtures/**"] },
    })();

    expect(config.test?.setupFiles).toEqual(["./test/setup.ts"]);
    expect(await projectsOf(config)).toEqual({
      "src/sum.test.ts": "unit",
      "tests/feature/home.test.ts": "feature",
    });
  });
});
