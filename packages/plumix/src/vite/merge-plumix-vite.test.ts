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

  test("disables Vite's built-in HMR error overlay so it never stacks with plumix's (#1622)", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', buildFetchHandler: () => () => new Response('ok') },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
      "utf8",
    );
    const plugin = plumix({ configFile: configPath });
    const result = await (
      plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
    )({ root: dir }, { command: "serve", mode: "development" });
    const server = (result as { server?: { hmr?: { overlay?: boolean } } })
      .server;
    expect(server?.hmr?.overlay).toBe(false);
  });

  test("lets a user re-enable Vite's overlay from plumix.config.ts.vite (merged after)", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', buildFetchHandler: () => () => new Response('ok') },
        database: { kind: 'x' },
        auth: { passkey: {} },
        vite: { server: { hmr: { overlay: true } } },
      };`,
      "utf8",
    );
    const plugin = plumix({ configFile: configPath });
    const result = await (
      plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
    )({ root: dir }, { command: "serve", mode: "development" });
    const server = (result as { server?: { hmr?: { overlay?: boolean } } })
      .server;
    expect(server?.hmr?.overlay).toBe(true);
  });

  test("defines process.env.PLUMIX_EDITOR from the dev machine's setting so the worker reads it", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', buildFetchHandler: () => () => new Response('ok') },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
      "utf8",
    );
    const previous = process.env.PLUMIX_EDITOR;
    process.env.PLUMIX_EDITOR = "cursor";
    try {
      const plugin = plumix({ configFile: configPath });
      const result = await (
        plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
      )({ root: dir }, { command: "serve", mode: "development" });
      const define = (result as { define?: Record<string, string> }).define;
      expect(define?.["process.env.PLUMIX_EDITOR"]).toBe(
        JSON.stringify("cursor"),
      );
    } finally {
      if (previous === undefined) delete process.env.PLUMIX_EDITOR;
      else process.env.PLUMIX_EDITOR = previous;
    }
  });
});

describe("plumix() vite plugin — island serialize virtual module", () => {
  test("resolves the virtual id and loads an IslandShim re-export from plumix/blocks", () => {
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
    // islands resolve the island runtime the same way plugin/userland ones do.
    expect(load(resolvedId)).toContain(
      `export { IslandShim } from "plumix/blocks"`,
    );
  });
});
