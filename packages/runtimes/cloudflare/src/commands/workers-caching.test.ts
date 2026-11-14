import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { WorkersCachingConfigError } from "../errors.js";
import { workersCaching } from "./workers-caching.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "plumix-workers-caching-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function moduleSource(): string {
  const plugin = workersCaching(root);
  const resolved = plugin.resolveId(
    "virtual:plumix-cloudflare/workers-caching",
  );
  if (resolved === undefined) throw new Error("the module did not resolve");
  const source = plugin.load(resolved);
  if (source === undefined) throw new Error("the module did not load");
  return source;
}

function build(): void {
  workersCaching(root).buildStart();
}

const GATEWAY_JSONC = `{
  // on
  "cache": { "enabled": true },
  "exports": {
    "default": { "type": "worker", "cache": { "enabled": false } },
    "PlumixSharedCache": { "type": "worker", "cache": { "enabled": true } },
  },
}`;

const GATEWAY_TOML = `[cache]
enabled = true

[exports.default]
type = "worker"

  [exports.default.cache]
  enabled = false

[exports.PlumixSharedCache]
type = "worker"

  [exports.PlumixSharedCache.cache]
  enabled = true
`;

const BINDS_THE_CACHED_ENTRYPOINT = [
  [
    "imports the Worker's exports",
    'import { exports } from "cloudflare:workers";',
  ],
  [
    "imports the binder",
    'import { bindWorkersCache } from "@plumix/runtime-cloudflare/cdn";',
  ],
  // Purges are per entrypoint, so one called from the default export would
  // never clear what the cached entrypoint stored.
  [
    "purges through the cached entrypoint",
    "bindWorkersCache({ purge: (options) => exports.PlumixSharedCache.purge(options) });",
  ],
  ["turns the gateway on", "export const sharedEntrypointCached = true;"],
] as const;

describe("the Workers Caching module", () => {
  describe.each([
    ["wrangler.jsonc", GATEWAY_JSONC],
    ["wrangler.toml", GATEWAY_TOML],
  ])("when %s caches the shared entrypoint", (filename, wrangler) => {
    test.each(BINDS_THE_CACHED_ENTRYPOINT)("%s", (_, line) => {
      writeFileSync(join(root, filename), wrangler);

      expect(moduleSource()).toContain(line);
    });

    test("builds", () => {
      writeFileSync(join(root, filename), wrangler);

      expect(build).not.toThrow();
    });
  });

  test.each([
    ["no cache block", '{"name":"app"}'],
    ["a disabled cache block", '{"cache":{"enabled":false}}'],
  ])("turns the gateway off with %s", (_, wrangler) => {
    writeFileSync(join(root, "wrangler.json"), wrangler);

    expect(moduleSource()).toBe(
      "export const sharedEntrypointCached = false;\n",
    );
  });

  test("turns the gateway off with no wrangler config at all", () => {
    expect(moduleSource()).toBe(
      "export const sharedEntrypointCached = false;\n",
    );
  });

  test("builds with no wrangler config at all", () => {
    expect(build).not.toThrow();
  });

  test("fails the build when only the top level enables caching, naming the shape", () => {
    writeFileSync(
      join(root, "wrangler.jsonc"),
      '{ "cache": { "enabled": true } }',
    );

    expect(build).toThrow(
      /wrangler\.jsonc caches the default entrypoint.*"exports": \{ "default": \{ "type": "worker", "cache": \{ "enabled": false \} \}, "PlumixSharedCache": \{ "type": "worker", "cache": \{ "enabled": true \} \} \}/s,
    );
  });

  test("fails the build with a Workers Caching config error", () => {
    writeFileSync(
      join(root, "wrangler.jsonc"),
      '{ "cache": { "enabled": true } }',
    );

    expect(build).toThrow(WorkersCachingConfigError);
  });

  test("fails the build when the default entrypoint opts into caching", () => {
    writeFileSync(
      join(root, "wrangler.json"),
      '{ "exports": { "default": { "type": "worker", "cache": { "enabled": true } } } }',
    );

    expect(build).toThrow(/wrangler\.json caches the default entrypoint/);
  });
});
