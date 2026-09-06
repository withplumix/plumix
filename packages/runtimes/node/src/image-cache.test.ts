import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";

import { createVariantCache } from "./image-cache.js";

let dir: string;
const bytes = Buffer.from("not really a picture");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "plumix-variant-cache-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a purge that lands while a variant is being written wins", async () => {
  const cache = createVariantCache(dir, 1024);
  const writing = cache.put("/a.png", "k", "png", bytes, cache.epoch("/a.png"));
  await cache.purge("/a.png");
  await writing;
  expect(await cache.touch("/a.png", "k", ["png"])).toBe(false);
  expect(readdirSync(dir)).toEqual([]);
});

test("a variant purged while it is being opened is not put back", async () => {
  const cache = createVariantCache(dir, 1024);
  await cache.put("/a.png", "k", "png", bytes, cache.epoch("/a.png"));
  const opening = cache.open("/a.png", "k", ["png"]);
  await cache.purge("/a.png");
  (await opening)?.body.stream.destroy();
  expect(await cache.touch("/a.png", "k", ["png"])).toBe(false);
});
