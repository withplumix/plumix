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

/** What the Worker's entry imports, as the plugin serves it. */
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
  'import { cache } from "cloudflare:workers";',
  'import { bindWorkersCache } from "@plumix/runtime-cloudflare/cdn";',
  "bindWorkersCache(cache);",
];

describe("the Workers Caching module", () => {
  test("binds the Workers cache when wrangler.jsonc enables it", () => {
    writeFileSync(
      join(root, "wrangler.jsonc"),
      '{\n  // on\n  "cache": { "enabled": true },\n}',
    );

    const source = moduleSource();

    for (const line of BINDS_WORKERS_CACHE) expect(source).toContain(line);
  });

  test("binds the Workers cache when wrangler.toml enables it", () => {
    writeFileSync(join(root, "wrangler.toml"), "[cache]\nenabled = true\n");

    const source = moduleSource();

    for (const line of BINDS_WORKERS_CACHE) expect(source).toContain(line);
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
