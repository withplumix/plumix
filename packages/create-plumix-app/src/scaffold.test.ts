import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { scaffold, shouldCopyTemplateEntry } from "./scaffold.js";

describe("scaffold", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "plumix-scaffold-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("creates target dir and copies the starter template files into it", async () => {
    const target = join(tmp, "my-blog");

    await scaffold({ targetDir: target });

    expect(readFileSync(join(target, "package.json"), "utf-8")).toContain(
      '"plumix"',
    );
    expect(readFileSync(join(target, "plumix.config.ts"), "utf-8")).toContain(
      "cloudflareDeployOrigin",
    );
    expect(readFileSync(join(target, "wrangler.jsonc"), "utf-8")).toContain(
      "d1_databases",
    );
    expect(readFileSync(join(target, "tsconfig.json"), "utf-8")).toContain(
      "@plumix/typescript-config",
    );
    expect(readFileSync(join(target, "README.md"), "utf-8")).toContain(
      "plumix-starter",
    );
  });

  test("rewrites the scaffolded package.json `name` to the target basename", async () => {
    const target = join(tmp, "my-cool-blog");

    await scaffold({ targetDir: target });

    const pkg = JSON.parse(
      readFileSync(join(target, "package.json"), "utf-8"),
    ) as { name: string };
    expect(pkg.name).toBe("my-cool-blog");
  });

  test("works when the target dir already exists but is empty", async () => {
    const target = join(tmp, "empty-dir");
    mkdirSync(target);

    await expect(scaffold({ targetDir: target })).resolves.toBeDefined();
    expect(readFileSync(join(target, "package.json"), "utf-8")).toContain(
      '"plumix"',
    );
  });

  test("rejects a target dir that already exists and is non-empty", async () => {
    const target = join(tmp, "occupied");
    mkdirSync(target);
    writeFileSync(join(target, "README.md"), "preexisting");

    await expect(scaffold({ targetDir: target })).rejects.toThrow(/not empty/i);
  });

  test("rejects when the target's parent dir does not exist", async () => {
    const target = join(tmp, "missing-parent", "child");

    await expect(scaffold({ targetDir: target })).rejects.toThrow(
      /parent.*not exist/i,
    );
  });

  test("rejects when the target path exists as a regular file (not a directory)", async () => {
    const target = join(tmp, "not-a-dir");
    writeFileSync(target, "I am a file, not a dir");

    // Friendly message ahead of Node's raw `ENOTDIR` — the assertion
    // pins our own wording so a future change won't regress to raw fs
    // errors leaking into the CLI output.
    await expect(scaffold({ targetDir: target })).rejects.toThrow(
      /target path exists but is not a directory/i,
    );
  });

  test("returns a result containing the resolved target and project name", async () => {
    const target = join(tmp, "outcome-test");

    const result = await scaffold({ targetDir: target });

    expect(result.targetDir).toBe(target);
    expect(result.name).toBe("outcome-test");
  });
});

describe("shouldCopyTemplateEntry", () => {
  const root = "/template";

  test("includes ordinary template files at any depth", () => {
    expect(shouldCopyTemplateEntry(`${root}/package.json`, root)).toBe(true);
    expect(shouldCopyTemplateEntry(`${root}/src/index.ts`, root)).toBe(true);
  });

  test("includes the template root itself", () => {
    expect(shouldCopyTemplateEntry(root, root)).toBe(true);
  });

  test("excludes node_modules at any depth", () => {
    expect(shouldCopyTemplateEntry(`${root}/node_modules`, root)).toBe(false);
    expect(
      shouldCopyTemplateEntry(`${root}/node_modules/react/index.js`, root),
    ).toBe(false);
    expect(shouldCopyTemplateEntry(`${root}/src/node_modules/x`, root)).toBe(
      false,
    );
  });

  test.each([".cache", ".turbo", ".wrangler", ".plumix", "dist"])(
    "excludes %s",
    (segment) => {
      expect(shouldCopyTemplateEntry(`${root}/${segment}`, root)).toBe(false);
      expect(
        shouldCopyTemplateEntry(`${root}/${segment}/some-file`, root),
      ).toBe(false);
    },
  );

  test("excluded segments outside the template root do not trip the filter", () => {
    // Template happens to live somewhere whose path contains an excluded
    // segment — only segments *inside* the template should matter.
    const nestedRoot = "/var/x/node_modules/my-template";
    expect(
      shouldCopyTemplateEntry(`${nestedRoot}/package.json`, nestedRoot),
    ).toBe(true);
  });
});
