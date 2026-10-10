import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

/**
 * Published only behind their own subpaths so a bundle that never imports them
 * never carries them.
 */
const SUBPATH_ONLY = ["db/libsql", "storage/s3", "cdn/cloudflare"] as const;

const root = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");
const sources = [...root.matchAll(/from\s+["']([^"']+)["']/g)].map(
  (match) => match[1] ?? "",
);

test.each(SUBPATH_ONLY)("the root plumix entry never reaches %s", (subpath) => {
  expect(sources.filter((source) => source.includes(subpath))).toEqual([]);
});
