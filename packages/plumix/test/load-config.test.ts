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

  test("throws config_not_found_default when no candidate exists", () => {
    expect(() => resolveConfigPath(dir)).toThrow(/No plumix\.config/);
  });

  test("throws config_not_found_explicit for a missing explicit path", () => {
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

  test("config_invalid when default export lacks required fields", async () => {
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      "export default { runtime: { name: 'x' } };",
      "utf8",
    );
    await expect(loadConfig(dir)).rejects.toMatchObject({
      code: "config_invalid",
    });
  });

  test("config_load_failed when the config throws on import", async () => {
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      "throw new Error('boom');",
      "utf8",
    );
    await expect(loadConfig(dir)).rejects.toMatchObject({
      code: "config_load_failed",
    });
  });

  test("loads a config whose theme imports a JSX (.tsx) module", async () => {
    // Guards the loader's `jsx: true`: themes author templates as JSX, so
    // jiti must parse the config's `.tsx` import graph. The stub `React`
    // keeps the classic-transform output runnable without node_modules.
    writeFileSync(
      join(dir, "view.tsx"),
      [
        "const React = { createElement: () => null, Fragment: null };",
        "export const view = () => <div>hello</div>;",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(dir, "plumix.config.ts"),
      [
        'import { view } from "./view.tsx";',
        "void view;",
        "export default {",
        "  runtime: { name: 'x', buildFetchHandler: () => undefined },",
        "  database: { kind: 'd1' },",
        "  auth: { passkey: {} },",
        "};",
      ].join("\n"),
      "utf8",
    );
    const { config } = await loadConfig(dir);
    expect(config.runtime.name).toBe("x");
  });
});
