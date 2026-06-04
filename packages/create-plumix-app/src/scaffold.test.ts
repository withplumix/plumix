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

import {
  CATALOG_RESOLUTIONS,
  resolveTemplateRoot,
  rewriteDeps,
  scaffold,
  shouldCopyTemplateEntry,
} from "./scaffold.js";

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
    expect(readFileSync(join(target, "README.md"), "utf-8")).toContain(
      "Plumix",
    );
  });

  test("writes a self-contained tsconfig that does not depend on workspace packages", async () => {
    const target = join(tmp, "ts-config-test");

    await scaffold({ targetDir: target });

    const tsconfig = readFileSync(join(target, "tsconfig.json"), "utf-8");
    // The workspace example extends `@plumix/typescript-config`, which is
    // a private dev-only package. The scaffolder inlines the compiler
    // options so end-user installs don't try to resolve it from npm.
    expect(tsconfig).not.toContain("@plumix/typescript-config");
    expect(tsconfig).not.toContain('"extends"');
    expect(tsconfig).toContain('"strict": true');
    expect(tsconfig).toContain('"moduleResolution": "Bundler"');
  });

  test("rewrites workspace:* and catalog: deps to concrete SemVer ranges", async () => {
    const target = join(tmp, "deps-test");

    await scaffold({ targetDir: target });

    const pkg = JSON.parse(
      readFileSync(join(target, "package.json"), "utf-8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [name, range] of Object.entries(allDeps)) {
      expect(
        range,
        `dep ${name} should not use workspace: protocol`,
      ).not.toMatch(/^workspace:/);
      expect(range, `dep ${name} should not use catalog: protocol`).not.toMatch(
        /^catalog:/,
      );
    }
    expect(pkg.dependencies?.plumix).toBe("^0.1.0");
    expect(pkg.dependencies?.["@plumix/runtime-cloudflare"]).toBe("^0.1.0");
  });

  test("drops @plumix/typescript-config from devDependencies", async () => {
    const target = join(tmp, "drop-ts-config");

    await scaffold({ targetDir: target });

    const pkg = JSON.parse(
      readFileSync(join(target, "package.json"), "utf-8"),
    ) as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.["@plumix/typescript-config"]).toBeUndefined();
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

describe("resolveTemplateRoot", () => {
  test("returns the workspace example path during dev/test", () => {
    // Inside the plumix workspace `examples/minimal` exists, so the
    // resolver should pick it — keeps the scaffolder output a perfect
    // mirror of the canonical example with no manual sync step.
    expect(resolveTemplateRoot()).toMatch(/examples\/minimal$/);
  });
});

describe("rewriteDeps", () => {
  test("returns undefined when given undefined", () => {
    expect(rewriteDeps(undefined)).toBeUndefined();
  });

  test("passes through concrete SemVer ranges unchanged", () => {
    expect(
      rewriteDeps({
        "drizzle-orm": "^0.45.2",
        valibot: "1.3.1",
      }),
    ).toEqual({
      "drizzle-orm": "^0.45.2",
      valibot: "1.3.1",
    });
  });

  test("rewrites workspace: protocol to the pinned plumix range", () => {
    expect(
      rewriteDeps({
        plumix: "workspace:*",
        "@plumix/runtime-cloudflare": "workspace:^",
      }),
    ).toEqual({
      plumix: "^0.1.0",
      "@plumix/runtime-cloudflare": "^0.1.0",
    });
  });

  test("rewrites catalog: protocol to the resolved version", () => {
    expect(
      rewriteDeps({
        typescript: "catalog:",
        wrangler: "catalog:",
      }),
    ).toEqual({
      typescript: CATALOG_RESOLUTIONS.typescript,
      wrangler: CATALOG_RESOLUTIONS.wrangler,
    });
  });

  test("drops @plumix/typescript-config entirely", () => {
    const result = rewriteDeps({
      "@plumix/typescript-config": "workspace:*",
      typescript: "catalog:",
    });
    expect(result).not.toHaveProperty("@plumix/typescript-config");
    expect(result?.typescript).toBe("^6.0.3");
  });

  test("throws on an unknown catalog: dep so a forgotten table entry fails loudly", () => {
    expect(() => rewriteDeps({ "some-future-dep": "catalog:" })).toThrow(
      /No catalog resolution for "some-future-dep"/,
    );
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

describe("CATALOG_RESOLUTIONS drift gate", () => {
  // Resolve the workspace root from the package's known position:
  // packages/create-plumix-app/src/scaffold.test.ts → ../../..
  const here = new URL(".", import.meta.url).pathname;
  const repoRoot = join(here, "..", "..", "..");

  const minimalPkg = JSON.parse(
    readFileSync(join(repoRoot, "examples", "minimal", "package.json"), "utf8"),
  ) as {
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
  };

  const workspaceCatalog = parseWorkspaceCatalog(
    readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"),
  );

  const minimalCatalogDeps = collectCatalogDeps(minimalPkg);

  test("every `catalog:` dep in examples/minimal has a CATALOG_RESOLUTIONS entry", () => {
    const missing = [...minimalCatalogDeps].filter(
      (name) => !(name in CATALOG_RESOLUTIONS),
    );
    expect(missing).toEqual([]);
  });

  test("CATALOG_RESOLUTIONS has no orphan entries unused by the minimal template", () => {
    const orphans = Object.keys(CATALOG_RESOLUTIONS).filter(
      (name) => !minimalCatalogDeps.has(name),
    );
    expect(orphans).toEqual([]);
  });

  test("each CATALOG_RESOLUTIONS entry used by minimal matches pnpm-workspace.yaml", () => {
    const drift: { name: string; scaffolder: string; workspace: string }[] = [];
    for (const name of minimalCatalogDeps) {
      const scaffolder = CATALOG_RESOLUTIONS[name];
      const workspace = workspaceCatalog[name];
      if (scaffolder !== workspace) {
        drift.push({
          name,
          scaffolder: scaffolder ?? "<missing>",
          workspace: workspace ?? "<missing>",
        });
      }
    }
    expect(drift).toEqual([]);
  });
});

function collectCatalogDeps(pkg: {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}): Set<string> {
  const out = new Set<string>();
  for (const block of [pkg.dependencies ?? {}, pkg.devDependencies ?? {}]) {
    for (const [name, range] of Object.entries(block)) {
      if (typeof range === "string" && range.startsWith("catalog:")) {
        out.add(name);
      }
    }
  }
  return out;
}

// Parses the top-level `catalog:` map out of pnpm-workspace.yaml. The
// format is stable (we control it) so a tiny line-scanner is enough —
// avoids pulling a YAML parser into the scaffolder tests.
function parseWorkspaceCatalog(yaml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = yaml.split("\n");
  let inCatalog = false;
  for (const line of lines) {
    if (line === "catalog:") {
      inCatalog = true;
      continue;
    }
    if (inCatalog) {
      // The catalog block ends at the next top-level key (no leading space).
      if (line.length > 0 && !line.startsWith(" ") && !line.startsWith("#")) {
        inCatalog = false;
        continue;
      }
      const match = /^\s+"?([^":\s]+)"?\s*:\s*(\S+)\s*$/.exec(line);
      const [, name, version] = match ?? [];
      if (name && version) {
        out[name] = version;
      }
    }
  }
  return out;
}
