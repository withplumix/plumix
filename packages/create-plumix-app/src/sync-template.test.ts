import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  shouldCopyTemplateEntry,
  syncAllTemplates,
  syncTemplate,
} from "./sync-template.js";
import { packageVersion, REPO_ROOT } from "./test-support.js";

const SOURCE = join(REPO_ROOT, "examples", "minimal");

describe("syncTemplate", () => {
  let dest: string;

  beforeEach(() => {
    dest = mkdtempSync(join(tmpdir(), "plumix-sync-test-"));
  });

  afterEach(() => {
    rmSync(dest, { recursive: true, force: true });
  });

  test("bakes a snapshot whose package.json carries no pnpm protocols", async () => {
    await syncTemplate({ source: SOURCE, dest, repoRoot: REPO_ROOT });

    const pkg = JSON.parse(
      readFileSync(join(dest, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [name, range] of Object.entries(allDeps)) {
      expect(range, `dep ${name}`).not.toMatch(/^(workspace|catalog):/);
    }
    expect(pkg.dependencies?.plumix).toBe(
      `^${packageVersion("packages/plumix")}`,
    );
    expect(pkg.devDependencies?.["@plumix/typescript-config"]).toBeUndefined();
  });

  test("snapshots every example into a like-named template directory", async () => {
    const names = await syncAllTemplates({
      examplesDir: join(REPO_ROOT, "examples"),
      templatesDir: dest,
      repoRoot: REPO_ROOT,
    });

    expect(names).toEqual(expect.arrayContaining(["blog", "minimal"]));
    for (const name of names) {
      expect(existsSync(join(dest, name, "package.json"))).toBe(true);
    }
    const blogPkg = JSON.parse(
      readFileSync(join(dest, "blog", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(blogPkg.dependencies?.["@plumix/plugin-blog"]).toBe(
      `^${packageVersion("packages/plugins/blog")}`,
    );
  });
});

describe("shouldCopyTemplateEntry", () => {
  const root = "/template";

  test("includes ordinary files at any depth and the root itself", () => {
    expect(shouldCopyTemplateEntry(root, root)).toBe(true);
    expect(shouldCopyTemplateEntry(`${root}/package.json`, root)).toBe(true);
    expect(shouldCopyTemplateEntry(`${root}/src/index.ts`, root)).toBe(true);
  });

  test.each([
    "node_modules",
    ".cache",
    ".turbo",
    ".wrangler",
    ".plumix",
    "dist",
    "drizzle",
  ])("excludes %s at any depth", (segment) => {
    expect(shouldCopyTemplateEntry(`${root}/${segment}`, root)).toBe(false);
    expect(shouldCopyTemplateEntry(`${root}/${segment}/x`, root)).toBe(false);
  });

  test("an excluded segment in the ancestor path does not trip the filter", () => {
    const nested = "/var/node_modules/my-template";
    expect(shouldCopyTemplateEntry(`${nested}/package.json`, nested)).toBe(
      true,
    );
  });
});
