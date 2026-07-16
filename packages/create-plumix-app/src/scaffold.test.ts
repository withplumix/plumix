import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { scaffold } from "./scaffold.js";
import { packageVersion } from "./test-support.js";

function readPkg(dir: string): {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(
    readFileSync(join(dir, "package.json"), "utf8"),
  ) as ReturnType<typeof readPkg>;
}

describe("scaffold — blank Cloudflare app", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "plumix-scaffold-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("composes a runnable project from the base skeleton", async () => {
    const target = join(tmp, "my-app");

    await scaffold({ targetDir: target });

    expect(readFileSync(join(target, "plumix.config.ts"), "utf8")).toContain(
      "cloudflareDeployOrigin",
    );
    expect(readFileSync(join(target, "wrangler.jsonc"), "utf8")).toContain(
      "d1_databases",
    );
    expect(readFileSync(join(target, "README.md"), "utf8")).toContain("Plumix");
    expect(existsSync(join(target, "theme", "index.tsx"))).toBe(true);
    expect(existsSync(join(target, ".gitignore"))).toBe(true);
  });

  test("registers no plugins for a blank app", async () => {
    const target = join(tmp, "blank");

    await scaffold({ targetDir: target });

    const config = readFileSync(join(target, "plumix.config.ts"), "utf8");
    expect(config).toContain("plugins: []");
    expect(config).not.toContain("@plumix/plugin");
    expect(readPkg(target).dependencies).not.toHaveProperty(
      "@plumix/plugin-blog",
    );
  });

  test("resolves workspace:* and catalog: deps to concrete ranges", async () => {
    const target = join(tmp, "deps");

    await scaffold({ targetDir: target });

    const pkg = readPkg(target);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, range] of Object.entries(allDeps)) {
      expect(range, `dep ${name}`).not.toMatch(/^(workspace|catalog):/);
    }
    expect(pkg.dependencies?.plumix).toBe(
      `^${packageVersion("packages/plumix")}`,
    );
    expect(pkg.dependencies?.["@plumix/runtime-cloudflare"]).toBe(
      `^${packageVersion("packages/runtimes/cloudflare")}`,
    );
  });

  test("names the package after the target basename", async () => {
    const target = join(tmp, "my-cool-site");

    await scaffold({ targetDir: target });

    expect(readPkg(target).name).toBe("my-cool-site");
  });

  test("writes a self-contained tsconfig with JSX enabled", async () => {
    const target = join(tmp, "ts");

    await scaffold({ targetDir: target });

    const tsconfig = readFileSync(join(target, "tsconfig.json"), "utf8");
    expect(tsconfig).not.toContain("@plumix/typescript-config");
    expect(tsconfig).not.toContain('"extends"');
    expect(tsconfig).toContain('"strict": true');
    expect(tsconfig).toContain('"jsx": "react"');
  });

  test("works into an existing empty directory", async () => {
    const target = join(tmp, "empty");
    mkdirSync(target);

    await expect(scaffold({ targetDir: target })).resolves.toBeDefined();
    expect(existsSync(join(target, "package.json"))).toBe(true);
  });

  test("rejects a non-empty target directory", async () => {
    const target = join(tmp, "occupied");
    mkdirSync(target);
    writeFileSync(join(target, "README.md"), "preexisting");

    await expect(scaffold({ targetDir: target })).rejects.toThrow(/not empty/i);
  });

  test("rejects when the parent directory does not exist", async () => {
    const target = join(tmp, "missing-parent", "child");

    await expect(scaffold({ targetDir: target })).rejects.toThrow(
      /parent.*not exist/i,
    );
  });

  test("rejects when the target path is a regular file", async () => {
    const target = join(tmp, "not-a-dir");
    writeFileSync(target, "I am a file");

    await expect(scaffold({ targetDir: target })).rejects.toThrow(
      /not a directory/i,
    );
  });

  test("rejects a project name that is not a valid npm package name", async () => {
    const target = join(tmp, "My App");

    await expect(scaffold({ targetDir: target })).rejects.toThrow(
      /invalid project name/i,
    );
    expect(existsSync(target)).toBe(false);
  });

  test("rejects an unknown runtime", async () => {
    const target = join(tmp, "bad-runtime");

    await expect(
      scaffold({ targetDir: target, runtimeId: "nope" }),
    ).rejects.toThrow(/unknown runtime "nope".*cloudflare/is);
  });

  test("returns the resolved target and project name", async () => {
    const target = join(tmp, "outcome");

    const result = await scaffold({ targetDir: target });

    expect(result).toEqual({ targetDir: target, name: "outcome" });
  });
});
