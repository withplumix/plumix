import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { resolveSiteModule } from "./site-module.js";

let site: string;

beforeEach(() => {
  site = mkdtempSync(join(tmpdir(), "plumix-site-module-"));
});

afterEach(() => {
  rmSync(site, { recursive: true, force: true });
});

function write(path: string): void {
  mkdirSync(join(site, path, ".."), { recursive: true });
  writeFileSync(join(site, path), "export {};\n");
}

describe("resolveSiteModule", () => {
  test.each([
    ["src/schema.mjs", "./src/schema.mjs"],
    ["src/schema.ts", "./src/schema"],
    ["src/schema.tsx", "./src/schema"],
    ["src/schema.js", "./src/schema"],
    ["src/schema/index.ts", "./src/schema"],
    ["src/schema/index.js", "./src/schema"],
  ])("finds %s for %s", (file, spec) => {
    write(file);

    expect(resolveSiteModule(site, spec)).toBe(join(site, file));
  });

  test("prefers the file as written over one with an extension added", () => {
    write("src/schema");
    write("src/schema.ts");

    expect(resolveSiteModule(site, "./src/schema")).toBe(
      join(site, "src/schema"),
    );
  });

  test("finds nothing for a path that names no file", () => {
    write("src/other.ts");

    expect(resolveSiteModule(site, "./src/schema")).toBeUndefined();
  });
});
