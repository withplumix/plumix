import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { plumix } from "./index.js";
import { SERIALIZE_VIRTUAL_ID } from "./island-transform.js";

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

describe("plumix() vite plugin — island serialize virtual module", () => {
  test("resolves the virtual id and loads a serializeProps re-export from plumix/blocks", () => {
    const plugin = plumix();
    const resolveId = plugin.resolveId as (
      id: string,
      importer?: string,
    ) => string | null;
    const load = plugin.load as (id: string) => string | null;

    const resolvedId = "\0" + SERIALIZE_VIRTUAL_ID;
    expect(resolveId(SERIALIZE_VIRTUAL_ID)).toBe(resolvedId);
    // The re-export resolves `plumix/blocks` from the project root rather
    // than from the island module's own (pnpm-strict) location, so core
    // islands resolve serializeProps the same way plugin/userland ones do.
    expect(load(resolvedId)).toContain(
      `export { serializeProps } from "plumix/blocks"`,
    );
  });
});
