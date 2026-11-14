import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { entrypointCached, loadWranglerConfig } from "./wrangler-config.js";

describe("loadWranglerConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-wrangler-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns null when no wrangler config is present", () => {
    expect(loadWranglerConfig(dir)).toBeNull();
  });

  test("parses wrangler.jsonc with comments and trailing commas", () => {
    writeFileSync(
      join(dir, "wrangler.jsonc"),
      `{
  // main worker
  "name": "app",
  "d1_databases": [
    { "binding": "DB", "database_name": "prod", }, // trailing comma
  ],
}`,
      "utf8",
    );
    const config = loadWranglerConfig(dir);
    expect(config).not.toBeNull();
    expect(config?.filename).toBe("wrangler.jsonc");
    expect(config?.d1Databases).toEqual([
      { binding: "DB", database_name: "prod" },
    ]);
  });

  test("parses wrangler.json (strict JSON)", () => {
    writeFileSync(
      join(dir, "wrangler.json"),
      JSON.stringify({
        name: "app",
        d1_databases: [
          { binding: "DB", database_name: "prod", database_id: "abc" },
        ],
      }),
      "utf8",
    );
    const config = loadWranglerConfig(dir);
    expect(config?.filename).toBe("wrangler.json");
    expect(config?.d1Databases[0]?.database_name).toBe("prod");
  });

  test("parses wrangler.toml", () => {
    writeFileSync(
      join(dir, "wrangler.toml"),
      `name = "app"

[[d1_databases]]
binding = "DB"
database_name = "prod"
database_id = "abc"
`,
      "utf8",
    );
    const config = loadWranglerConfig(dir);
    expect(config?.filename).toBe("wrangler.toml");
    expect(config?.d1Databases[0]?.database_name).toBe("prod");
  });

  test("returns wrangler.jsonc when both .jsonc and .toml exist (precedence)", () => {
    writeFileSync(join(dir, "wrangler.jsonc"), '{"name":"jsonc"}', "utf8");
    writeFileSync(join(dir, "wrangler.toml"), 'name = "toml"\n', "utf8");
    expect(loadWranglerConfig(dir)?.filename).toBe("wrangler.jsonc");
  });

  test("returns an empty d1Databases list when the field is absent", () => {
    writeFileSync(join(dir, "wrangler.json"), '{"name":"app"}', "utf8");
    expect(loadWranglerConfig(dir)?.d1Databases).toEqual([]);
  });

  test("throws when wrangler.jsonc has a syntax error", () => {
    writeFileSync(join(dir, "wrangler.jsonc"), "{ not: valid json", "utf8");
    expect(() => loadWranglerConfig(dir)).toThrow(/Failed to parse/);
  });

  describe("Workers Caching", () => {
    function workersCaching(text: string, filename = "wrangler.jsonc") {
      writeFileSync(join(dir, filename), text, "utf8");
      return loadWranglerConfig(dir)?.workersCaching;
    }

    test("is off with no cache block", () => {
      expect(workersCaching('{ "name": "app" }')).toEqual({
        enabled: false,
        entrypoints: {},
      });
    });

    test("reads each entrypoint's cache block beside the top level's", () => {
      expect(
        workersCaching(`{
  "cache": { "enabled": true },
  "exports": {
    "default": { "type": "worker", "cache": { "enabled": false } },
    "Counter": { "type": "durable_object", "storage": "sqlite" },
  },
}`),
      ).toEqual({ enabled: true, entrypoints: { default: false } });
    });

    test("reads the per-entrypoint shape from wrangler.toml", () => {
      expect(
        workersCaching(
          `[cache]
enabled = true

[exports.default]
type = "worker"

  [exports.default.cache]
  enabled = false
`,
          "wrangler.toml",
        ),
      ).toEqual({ enabled: true, entrypoints: { default: false } });
    });

    test("the scaffold caches the shared entrypoint and not the gateway", () => {
      const scaffold = new URL("../scaffold", import.meta.url).pathname;

      expect(loadWranglerConfig(scaffold)?.workersCaching).toEqual({
        enabled: true,
        entrypoints: { default: false, PlumixSharedCache: true },
      });
    });
  });
});

describe("entrypointCached", () => {
  const caching = (
    enabled: boolean,
    entrypoints: Record<string, boolean> = {},
  ) => ({ workersCaching: { enabled, entrypoints } });

  test("an entrypoint with no cache block of its own takes the top level's", () => {
    expect(entrypointCached(caching(true), "PlumixSharedCache")).toBe(true);
  });

  test("an entrypoint's own cache block overrides the top level's", () => {
    expect(entrypointCached(caching(true, { default: false }), "default")).toBe(
      false,
    );
  });

  test("an entrypoint listed alone is cached with no top-level cache block", () => {
    expect(
      entrypointCached(
        caching(false, { PlumixSharedCache: true }),
        "PlumixSharedCache",
      ),
    ).toBe(true);
  });
});
