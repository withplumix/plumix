import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { checkEmit } from "./assert-emit.mjs";

describe("checkEmit", () => {
  let pkg: string;

  beforeEach(() => {
    pkg = mkdtempSync(join(tmpdir(), "plumix-assert-emit-"));
  });

  afterEach(() => {
    rmSync(pkg, { recursive: true, force: true });
  });

  function writePackageJson(manifest: unknown): void {
    writeFileSync(join(pkg, "package.json"), JSON.stringify(manifest));
  }

  function emit(...files: string[]): void {
    for (const file of files) {
      mkdirSync(dirname(join(pkg, file)), { recursive: true });
      writeFileSync(join(pkg, file), "export {};\n");
    }
  }

  test("passes when every exports target was emitted", () => {
    writePackageJson({
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
    });
    emit("dist/index.d.ts", "dist/index.js");

    expect(checkEmit(pkg).ok).toBe(true);
  });

  test("fails when declarations are missing, which is what consumers resolve", () => {
    writePackageJson({
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
    });
    emit("dist/index.js");

    const result = checkEmit(pkg);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("dist/index.d.ts");
  });

  test("fails on a partial emit even when other entries landed", () => {
    writePackageJson({
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./manifest": {
          types: "./dist/manifest.d.ts",
          default: "./dist/manifest.js",
        },
      },
    });
    emit("dist/index.d.ts", "dist/index.js");

    const result = checkEmit(pkg);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("dist/manifest.js");
    expect(result.message).not.toContain("dist/index.js");
  });

  test("checks bin and main targets too", () => {
    writePackageJson({ main: "./dist/index.js", bin: "./dist/cli.js" });
    emit("dist/index.js");

    const result = checkEmit(pkg);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("dist/cli.js");
  });

  test("ignores non-dist targets, which the build does not emit", () => {
    writePackageJson({
      exports: { "./locales/*": "./locales/*.mjs", ".": "./dist/index.js" },
    });
    emit("dist/index.js");

    expect(checkEmit(pkg).ok).toBe(true);
  });

  // Packages built by bundlers (e.g. vite) declare no exports map, so fall
  // back to the weaker "something was emitted" floor.
  test("falls back to requiring emitted JavaScript when there is no exports map", () => {
    writePackageJson({ files: ["dist"] });
    mkdirSync(join(pkg, "dist"));

    const result = checkEmit(pkg);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no javascript/i);
  });

  test("fails when the build produced no dist at all", () => {
    writePackageJson({ files: ["dist"] });

    expect(checkEmit(pkg).ok).toBe(false);
  });
});
