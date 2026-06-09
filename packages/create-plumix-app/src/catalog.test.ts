import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  EMPTY_CATALOG_CONTEXT,
  loadCatalogContext,
  parseWorkspaceCatalog,
  resolveDeps,
} from "./catalog.js";
import { packageVersion, REPO_ROOT } from "./test-support.js";

describe("resolveDeps", () => {
  test("passes concrete SemVer ranges through unchanged", () => {
    expect(
      resolveDeps(
        { "drizzle-orm": "^0.45.2", valibot: "1.3.1" },
        EMPTY_CATALOG_CONTEXT,
      ),
    ).toEqual({ "drizzle-orm": "^0.45.2", valibot: "1.3.1" });
  });

  test("resolves `catalog:` deps to the catalog range", () => {
    expect(
      resolveDeps(
        { typescript: "catalog:", wrangler: "catalog:" },
        {
          catalog: { typescript: "^6.0.3", wrangler: "^4.98.0" },
          workspaceVersions: {},
        },
      ),
    ).toEqual({ typescript: "^6.0.3", wrangler: "^4.98.0" });
  });

  test("resolves `workspace:` deps to a caret range on the package version", () => {
    expect(
      resolveDeps(
        { plumix: "workspace:*", "@plumix/runtime-cloudflare": "workspace:^" },
        {
          catalog: {},
          workspaceVersions: {
            plumix: "0.1.0",
            "@plumix/runtime-cloudflare": "0.1.0",
          },
        },
      ),
    ).toEqual({ plumix: "^0.1.0", "@plumix/runtime-cloudflare": "^0.1.0" });
  });

  test("drops @plumix/typescript-config, a private dev-only package", () => {
    const result = resolveDeps(
      { "@plumix/typescript-config": "workspace:*", typescript: "catalog:" },
      { catalog: { typescript: "^6.0.3" }, workspaceVersions: {} },
    );
    expect(result).not.toHaveProperty("@plumix/typescript-config");
    expect(result?.typescript).toBe("^6.0.3");
  });

  test("throws on a `catalog:` dep absent from the catalog", () => {
    expect(() =>
      resolveDeps({ "future-dep": "catalog:" }, EMPTY_CATALOG_CONTEXT),
    ).toThrow(/future-dep/);
  });

  test("throws on a `workspace:` dep whose version can't be found", () => {
    expect(() =>
      resolveDeps({ "@plumix/ghost": "workspace:*" }, EMPTY_CATALOG_CONTEXT),
    ).toThrow(/@plumix\/ghost/);
  });

  test("returns undefined when given undefined", () => {
    expect(resolveDeps(undefined, EMPTY_CATALOG_CONTEXT)).toBeUndefined();
  });
});

describe("parseWorkspaceCatalog", () => {
  test("reads the default catalog block, stopping at the next top-level key", () => {
    const yaml = [
      "packages:",
      '  - "packages/*"',
      "",
      "catalog:",
      '  "@types/node": ^24.13.1',
      "  typescript: ^6.0.3",
      "  wrangler: ^4.98.0",
      "",
      "onlyBuiltDependencies:",
      "  - esbuild",
    ].join("\n");

    expect(parseWorkspaceCatalog(yaml)).toEqual({
      "@types/node": "^24.13.1",
      typescript: "^6.0.3",
      wrangler: "^4.98.0",
    });
  });
});

describe("loadCatalogContext", () => {
  test("reads the catalog and workspace package versions from the monorepo", async () => {
    const ctx = await loadCatalogContext(REPO_ROOT);

    // The catalog mirrors pnpm-workspace.yaml — no hand-kept copy.
    const catalog = parseWorkspaceCatalog(
      readFileSync(join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8"),
    );
    expect(ctx.catalog).toEqual(catalog);
    expect(ctx.catalog.typescript).toBe(catalog.typescript);

    // Versions come straight from each package's own package.json.
    expect(ctx.workspaceVersions.plumix).toBe(
      packageVersion("packages/plumix"),
    );
    expect(ctx.workspaceVersions["@plumix/runtime-cloudflare"]).toBeDefined();
  });
});
