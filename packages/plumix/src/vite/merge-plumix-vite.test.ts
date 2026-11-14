import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plugin, Rolldown, UserConfig } from "vite";
import {
  build,
  createBuilder,
  createLogger,
  mergeConfig,
  resolveConfig,
} from "vite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

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

  test("leaves the site's vite.plugins out of the config it merges", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
        vite: { plugins: [{ name: 'site-probe' }], server: { port: 4321 } },
      };`,
      "utf8",
    );
    const [plugin] = plumix({ configFile: configPath });
    const result = (await (
      plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
    )({ root: dir }, { command: "serve", mode: "development" })) as UserConfig;
    expect(result.plugins).toBeUndefined();
    expect(result.server?.port).toBe(4321);
  });

  test("disables Vite's built-in HMR error overlay so it never stacks with plumix's (#1622)", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
      "utf8",
    );
    const [plugin] = plumix({ configFile: configPath });
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
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
        vite: { server: { hmr: { overlay: true } } },
      };`,
      "utf8",
    );
    const [plugin] = plumix({ configFile: configPath });
    const result = await (
      plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
    )({ root: dir }, { command: "serve", mode: "development" });
    const server = (result as { server?: { hmr?: { overlay?: boolean } } })
      .server;
    expect(server?.hmr?.overlay).toBe(true);
  });

  test("keeps the admin staging directory out of the dev server's file watcher", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
      "utf8",
    );
    const [plugin] = plumix({ configFile: configPath });
    const result = await (
      plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
    )({ root: dir }, { command: "serve", mode: "development" });
    const ignored = (
      result as {
        server?: { watch?: { ignored?: ((path: string) => boolean)[] } };
      }
    ).server?.watch?.ignored;
    const isIgnored = (path: string): boolean =>
      (ignored ?? []).some((matches) => matches(path));

    expect(isIgnored(join(dir, ".plumix/admin-staging/a1/index.html"))).toBe(
      true,
    );
    expect(
      isIgnored(join(dir, ".plumix/public/_plumix/admin/index.html")),
    ).toBe(false);
    expect(isIgnored(join(dir, ".plumix/worker.ts"))).toBe(false);
  });

  test("defines process.env.PLUMIX_EDITOR from the dev machine's setting so the worker reads it", async () => {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
      "utf8",
    );
    const previous = process.env.PLUMIX_EDITOR;
    process.env.PLUMIX_EDITOR = "cursor";
    try {
      const [plugin] = plumix({ configFile: configPath });
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

  describe("Workers Builds env", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    async function buildDefine(): Promise<Record<string, string> | undefined> {
      const configPath = join(dir, "plumix.config.mjs");
      writeFileSync(
        configPath,
        `export default {
          runtime: { name: 'x', handler: {}, generateEntry: () => '' },
          database: { kind: 'x' },
          auth: { passkey: {} },
        };`,
        "utf8",
      );
      const [plugin] = plumix({ configFile: configPath });
      const result = await (
        plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
      )({ root: dir }, { command: "build", mode: "production" });
      return (result as { define?: Record<string, string> }).define;
    }

    test("defines WORKERS_CI and WORKERS_CI_BRANCH from the build's env, since a deployed Worker's process.env is empty", async () => {
      vi.stubEnv("WORKERS_CI", "1");
      vi.stubEnv("WORKERS_CI_BRANCH", "feat/x");

      const define = await buildDefine();

      expect(define?.["process.env.WORKERS_CI"]).toBe(JSON.stringify("1"));
      expect(define?.["process.env.WORKERS_CI_BRANCH"]).toBe(
        JSON.stringify("feat/x"),
      );
    });

    test("defines both as empty strings when the build runs outside Workers Builds", async () => {
      vi.stubEnv("WORKERS_CI", undefined);
      vi.stubEnv("WORKERS_CI_BRANCH", undefined);

      const define = await buildDefine();

      expect(define?.["process.env.WORKERS_CI"]).toBe(JSON.stringify(""));
      expect(define?.["process.env.WORKERS_CI_BRANCH"]).toBe(
        JSON.stringify(""),
      );
    });
  });

  describe("build id", () => {
    const UUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

    function sitePlugin(): Plugin {
      const configPath = join(dir, "plumix.config.mjs");
      writeFileSync(
        configPath,
        `export default {
          runtime: { name: 'x', handler: {}, generateEntry: () => '' },
          database: { kind: 'x' },
          auth: { passkey: {} },
        };`,
        "utf8",
      );
      const [plugin] = plumix({ configFile: configPath });
      return plugin;
    }

    async function buildId(
      plugin: Plugin,
      command: "build" | "serve",
    ): Promise<unknown> {
      const result = await (
        plugin.config as (userConfig: unknown, env: unknown) => Promise<unknown>
      )({ root: dir }, { command, mode: "production" });
      const define = (result as { define?: Record<string, string> }).define;
      const raw = define?.["process.env.PLUMIX_BUILD_ID"];
      return raw === undefined ? undefined : JSON.parse(raw);
    }

    test("resolves one UUID for both the client and server environments of a build", async () => {
      const resolved = await resolveConfig(
        {
          configFile: false,
          root: dir,
          plugins: [sitePlugin()],
          environments: { client: {}, server: {} },
        },
        "build",
      );

      const client: unknown =
        resolved.environments.client?.define?.["process.env.PLUMIX_BUILD_ID"];
      const server: unknown =
        resolved.environments.server?.define?.["process.env.PLUMIX_BUILD_ID"];
      expect(JSON.parse(String(client))).toMatch(UUID);
      expect(server).toBe(client);
    });

    test("gives two builds different ids, so a deploy never reads the last one's pages", async () => {
      const a = await buildId(sitePlugin(), "build");
      const b = await buildId(sitePlugin(), "build");

      expect(a).toMatch(UUID);
      expect(b).toMatch(UUID);
      expect(a).not.toBe(b);
    });

    test('defines "dev" under the dev server', async () => {
      expect(await buildId(sitePlugin(), "serve")).toBe("dev");
    });
  });

  // Builds `entry.js` with the `build` options the plugin's `config()` returns
  // and collects every warning that reaches Vite's logger.
  async function buildWarnings(
    userConfig: UserConfig,
    entrySource: string,
  ): Promise<string[]> {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
      "utf8",
    );
    const [plugin] = plumix({ configFile: configPath });
    const result = (
      await (
        plugin.config as (
          userConfig: UserConfig,
          env: unknown,
        ) => Promise<UserConfig>
      )({ ...userConfig, root: dir }, { command: "build", mode: "production" })
    ).build;
    const entry = join(dir, "entry.js");
    writeFileSync(entry, entrySource, "utf8");
    const warnings: string[] = [];
    const logger = createLogger("warn");
    logger.warn = (message) => {
      warnings.push(message);
    };
    await build({
      root: dir,
      configFile: false,
      logLevel: "warn",
      customLogger: logger,
      build: mergeConfig(userConfig.build ?? {}, {
        ...result,
        write: false,
        rolldownOptions: { ...result?.rolldownOptions, input: entry },
      }),
    });
    return warnings;
  }

  test('keeps rolldown\'s "use client" directive warning out of the build output', async () => {
    const warnings = await buildWarnings(
      {},
      `"use client";\nexport const island = 1;\n`,
    );
    expect(warnings.join("\n")).not.toContain("MODULE_LEVEL_DIRECTIVE");
  });

  test("still hands every other warning to the site's own onLog", async () => {
    const seen: string[] = [];
    await buildWarnings(
      {
        build: {
          rolldownOptions: {
            onLog(level, log) {
              if (level === "warn") seen.push(log.message);
            },
          },
        },
      },
      `"use client";\n"use strict-ish";\nexport const island = 1;\n`,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(`"use strict-ish"`);
  });
});

describe("plumix() vite plugin — island serialize virtual module", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-vite-serialize-"));
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("resolves the virtual id and loads an IslandShim re-export from plumix/blocks", () => {
    const [plugin] = plumix({ configFile: join(dir, "plumix.config.mjs") });
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

describe("plumix() vite plugin — the site's vite.plugins", () => {
  let dir: string;

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-vite-plugins-")));
    const adminDir = join(dir, "admin-dist");
    mkdirSync(adminDir);
    writeFileSync(
      join(adminDir, "index.html"),
      `<!doctype html><script id="${MANIFEST_SCRIPT_ID}" type="application/json">{}</script>`,
    );
    writeFileSync(
      join(adminDir, "catalog-locales.json"),
      JSON.stringify({
        sourceLocale: "en",
        catalogs: { admin: ["en"], editor: ["en"], blocks: ["en"] },
      }),
    );
    writeFileSync(join(dir, "entry.js"), "export const page = 1;\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // A resolved config written out: evaluating the real `plumix()` costs half a minute.
  function writeSiteConfig(vite: string): string {
    const configPath = join(dir, "plumix.config.mjs");
    writeFileSync(
      configPath,
      `import { appendFileSync } from "node:fs";
const en = { code: "en", label: "English", direction: "ltr", enabled: true };
export default {
  runtime: { name: "x", handler: {}, generateEntry: () => "" },
  database: { kind: "x" },
  auth: { passkey: {} },
  theme: { templates: [] },
  plugins: [],
  i18n: { defaultLocale: en, locales: [en] },
  ${vite}
};
`,
      "utf8",
    );
    return configPath;
  }

  async function buildSite(configPath: string): Promise<string[]> {
    const builder = await createBuilder({
      configFile: false,
      root: dir,
      logLevel: "silent",
      plugins: [
        plumix({ configFile: configPath, adminDir: join(dir, "admin-dist") }),
      ],
      environments: {
        site: {
          consumer: "server",
          build: {
            write: false,
            rolldownOptions: { input: join(dir, "entry.js") },
          },
        },
      },
    });
    const environment = builder.environments.site;
    if (environment === undefined) throw new Error("no site environment");
    const output = (await builder.build(
      environment,
    )) as Rolldown.RolldownOutput;
    return output.output.map((chunk) => chunk.fileName);
  }

  test("runs a plugin the site lists under vite.plugins once per bundle", async () => {
    const bundles = join(dir, "bundles.log");
    const configPath = writeSiteConfig(
      `vite: { plugins: [{ name: "site-probe", generateBundle() { appendFileSync(${JSON.stringify(bundles)}, "x"); } }] },`,
    );

    await buildSite(configPath);

    expect(readFileSync(bundles, "utf8")).toBe("x");
  });

  test("builds a site whose config lists no vite.plugins", async () => {
    const configPath = writeSiteConfig("");

    const files = await buildSite(configPath);

    expect(files).toContain("entry.mjs");
  });
});
