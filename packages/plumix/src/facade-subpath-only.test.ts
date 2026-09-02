import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

// The libSQL driver and the S3 signer are published only behind their own
// subpaths so a bundle that never imports them never carries them. Core's
// barrel is guarded in its own package; this is the façade half — the root
// `plumix` entry must not reach either, through core or by a local re-export.
const SUBPATH_ONLY = ["db/libsql", "storage/s3"] as const;

const root = readFileSync(resolve(import.meta.dirname, "index.ts"), "utf8");
const sources = [...root.matchAll(/from\s+["']([^"']+)["']/g)].map(
  (match) => match[1] ?? "",
);

test.each(SUBPATH_ONLY)("the root plumix entry never reaches %s", (subpath) => {
  expect(sources.filter((source) => source.includes(subpath))).toEqual([]);
});
