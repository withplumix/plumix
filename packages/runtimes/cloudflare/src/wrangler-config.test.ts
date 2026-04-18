import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { loadWranglerConfig } from "./wrangler-config.js";

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
});
