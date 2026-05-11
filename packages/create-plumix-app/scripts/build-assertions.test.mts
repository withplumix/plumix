import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { assertBuildOutputs } from "./build-assertions.mjs";

describe("assertBuildOutputs", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "plumix-build-assert-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns silently when every expected path exists", () => {
    mkdirSync(join(tmp, ".plumix"));
    writeFileSync(join(tmp, ".plumix", "worker.ts"), "// ok");
    mkdirSync(join(tmp, "dist"));
    writeFileSync(join(tmp, "dist", "manifest.json"), "{}");

    expect(() =>
      assertBuildOutputs(tmp, [".plumix/worker.ts", "dist/manifest.json"]),
    ).not.toThrow();
  });

  test("throws naming the first missing path", () => {
    mkdirSync(join(tmp, ".plumix"));
    writeFileSync(join(tmp, ".plumix", "worker.ts"), "// ok");

    expect(() =>
      assertBuildOutputs(tmp, [".plumix/worker.ts", "dist/manifest.json"]),
    ).toThrow(/dist\/manifest\.json/);
  });

  test("error message includes the full target dir for grep-ability", () => {
    // Substring-match against the raw path — building a regex from a
    // filesystem path needs full metachar escaping (not just `/`);
    // `toThrow(string)` does substring matching, which is what we want.
    expect(() => assertBuildOutputs(tmp, ["dist/bundle.js"])).toThrow(tmp);
  });

  test("empty expected list never throws", () => {
    expect(() => assertBuildOutputs(tmp, [])).not.toThrow();
  });

  test("treats a directory as 'exists' (not just files)", () => {
    mkdirSync(join(tmp, "dist"));

    expect(() => assertBuildOutputs(tmp, ["dist"])).not.toThrow();
  });
});
