import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createCatalogLoader } from "./load-catalog.js";

describe("createCatalogLoader", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-catalog-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns the parsed JSON catalog when the file exists", async () => {
    writeFileSync(
      join(dir, "de.json"),
      JSON.stringify({ "menu.signOut": ["Abmelden"] }),
    );
    const load = createCatalogLoader();

    expect(await load({ locale: "de", bundledPath: dir })).toEqual({
      "menu.signOut": ["Abmelden"],
    });
  });

  test("returns null when the catalog file is missing", async () => {
    const load = createCatalogLoader();
    expect(await load({ locale: "zz", bundledPath: dir })).toBeNull();
  });

  test("throws a structured error naming the file on malformed JSON", async () => {
    writeFileSync(join(dir, "de.json"), "{ not valid json");
    const load = createCatalogLoader();

    await expect(load({ locale: "de", bundledPath: dir })).rejects.toThrow(
      /de\.json/,
    );
  });

  test("caches misses: a file appearing after the first lookup stays null", async () => {
    const load = createCatalogLoader();
    const args = { locale: "de", bundledPath: dir };

    expect(await load(args)).toBeNull();
    writeFileSync(join(dir, "de.json"), JSON.stringify({ a: ["1"] }));
    expect(await load(args)).toBeNull();
  });

  test("invalidates the cache when the file's mtime advances", async () => {
    const path = join(dir, "de.json");
    writeFileSync(path, JSON.stringify({ a: ["1"] }));
    const load = createCatalogLoader();
    const args = { locale: "de", bundledPath: dir };

    const first = await load(args);
    const future = new Date(Date.now() + 60_000);
    writeFileSync(path, JSON.stringify({ a: ["2"] }));
    utimesSync(path, future, future);

    expect(first).toEqual({ a: ["1"] });
    expect(await load(args)).toEqual({ a: ["2"] });
  });
});
