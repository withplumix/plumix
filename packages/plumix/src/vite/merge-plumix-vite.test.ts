import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { plumix } from "./index.js";

describe("plumix() vite plugin — `config()` merges plumix.config.vite", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-vite-merge-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("plugins declared in plumix.config.ts.vite reach the returned config", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', buildFetchHandler: () => () => new Response('ok') },
        database: { kind: 'x' },
        auth: { passkey: {} },
        vite: { plugins: [{ name: 'tailwindcss-probe' }] },
      };`,
      "utf8",
    );
    const plugin = plumix({ configFile: configPath });
    const result = await (
      plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
    )({ root: dir }, { command: "serve", mode: "development" });
    const merged = result as { plugins?: readonly { name?: string }[] };
    expect(merged.plugins?.map((p) => p.name)).toContain("tailwindcss-probe");
  });
});
