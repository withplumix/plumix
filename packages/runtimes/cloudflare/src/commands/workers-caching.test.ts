import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

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

const BINDS_WORKERS_CACHE = [
  ["imports the Workers cache", 'import { cache } from "cloudflare:workers";'],
  [
    "imports the binder",
    'import { bindWorkersCache } from "@plumix/runtime-cloudflare/cdn";',
  ],
  ["binds the cache", "bindWorkersCache(cache);"],
] as const;

describe("the Workers Caching module", () => {
  describe.each([
    ["wrangler.jsonc", '{\n  // on\n  "cache": { "enabled": true },\n}'],
    ["wrangler.toml", "[cache]\nenabled = true\n"],
  ])("when %s enables it", (filename, wrangler) => {
    test.each(BINDS_WORKERS_CACHE)("%s", (_, line) => {
      writeFileSync(join(root, filename), wrangler);

      expect(moduleSource()).toContain(line);
    });
  });

  test.each([
    ["no cache block", '{"name":"app"}'],
    ["a disabled cache block", '{"cache":{"enabled":false}}'],
  ])("is empty with %s", (_, wrangler) => {
    writeFileSync(join(root, "wrangler.json"), wrangler);

    expect(moduleSource()).not.toContain("cloudflare:workers");
  });

  test("is empty with no wrangler config at all", () => {
    expect(moduleSource()).not.toContain("cloudflare:workers");
  });
});
