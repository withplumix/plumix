import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { loadConfig, resolveConfigPath } from "../src/cli/load-config.js";

describe("resolveConfigPath", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-cli-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("finds plumix.config.ts by default", () => {
    const path = join(dir, "plumix.config.ts");
    writeFileSync(path, "", "utf8");
    expect(resolveConfigPath(dir)).toBe(path);
  });

  test("accepts an explicit --config path", () => {
    const path = join(dir, "custom.config.ts");
    writeFileSync(path, "", "utf8");
    expect(resolveConfigPath(dir, "custom.config.ts")).toBe(path);
  });

  test("throws CONFIG_NOT_FOUND when no candidate exists", () => {
    expect(() => resolveConfigPath(dir)).toThrow(/No plumix\.config/);
  });

  test("throws CONFIG_NOT_FOUND for a missing explicit path", () => {
    expect(() => resolveConfigPath(dir, "absent.ts")).toThrow(
      /Config file not found/,
    );
  });
});

describe("loadConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-cli-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("CONFIG_INVALID when default export lacks required fields", async () => {
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      "export default { runtime: { name: 'x' } };",
      "utf8",
    );
    await expect(loadConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  test("CONFIG_LOAD_FAILED when the config throws on import", async () => {
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      "throw new Error('boom');",
      "utf8",
    );
    await expect(loadConfig(dir)).rejects.toMatchObject({
      code: "CONFIG_LOAD_FAILED",
    });
  });
});
