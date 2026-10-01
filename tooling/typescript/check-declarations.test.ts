import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  checkDeclarations,
  describeLeaks,
  findSpecifiers,
} from "./check-declarations.mjs";

describe("findSpecifiers", () => {
  test("reports an inferred type the compiler named through an internal package", () => {
    expect(
      findSpecifiers(
        'export declare const pages: import("@plumix/core").PluginDescriptor<undefined>;',
      ),
    ).toEqual(["@plumix/core"]);
  });

  test("reports an internal subpath inside a `typeof import()`", () => {
    expect(
      findSpecifiers(
        'type Ctx = AppContextBase<typeof import("@plumix/core/schema")>;',
      ),
    ).toEqual(["@plumix/core/schema"]);
  });

  test("reports import, re-export and triple-slash reference forms", () => {
    const source = [
      '/// <reference types="@plumix/admin-ui" />',
      'import type { BlockSpec } from "@plumix/core/blocks";',
      'export * from "@plumix/admin-editor";',
      "export { getRuntime } from '@plumix/admin';",
    ].join("\n");
    expect(findSpecifiers(source)).toEqual([
      "@plumix/admin-ui",
      "@plumix/core/blocks",
      "@plumix/admin-editor",
      "@plumix/admin",
    ]);
  });

  test("reports the façade and the published packages beside it too", () => {
    const source = [
      'import type { PluginDescriptor } from "plumix/plugin";',
      'import type { OgImage } from "@plumix/plugin-seo";',
      'export declare const cf: import("@plumix/runtime-cloudflare").Adapter;',
      'type T = import("@plumix/core-extras").T;',
    ].join("\n");
    expect(findSpecifiers(source)).toEqual([
      "plumix/plugin",
      "@plumix/plugin-seo",
      "@plumix/runtime-cloudflare",
      "@plumix/core-extras",
    ]);
  });

  test("ignores a specifier a doc comment only mentions", () => {
    const source = [
      "/**",
      ' * Prefer `import { definePlugin } from "plumix/plugin"` over',
      ' * `import("@plumix/core")`, which a consumer cannot resolve.',
      " */",
      'export declare const x: import("plumix").PluginDescriptor;',
    ].join("\n");
    expect(findSpecifiers(source)).toEqual(["plumix"]);
  });

  test("still reads code after a string holding `/*`, as a route pattern does", () => {
    const source = [
      'export declare const CARD_ROUTE_PATH = "/card/*";',
      'export declare const card: import("@plumix/core").RouteHandler;',
      "/** The prefix the route is mounted under. */",
      "export declare const PREFIX: string;",
    ].join("\n");
    expect(findSpecifiers(source)).toEqual(["@plumix/core"]);
  });
});

describe("checkDeclarations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  function pkg(manifest: object, files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "check-declarations-"));
    dirs.push(dir);
    const all = { "package.json": JSON.stringify(manifest), ...files };
    for (const [file, source] of Object.entries(all)) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), source);
    }
    return dir;
  }

  test("reports a package a published declaration names but the manifest does not declare", () => {
    const dir = pkg(
      {
        name: "plumix",
        exports: {
          "./admin/react-router": {
            types: "./dist/admin/react-router.d.ts",
            default: "./dist/admin/react-router.js",
          },
        },
      },
      {
        "dist/admin/react-router.d.ts": [
          'export declare const redirect: typeof import("@tanstack/router-core").redirect;',
          'export declare const h: import("@tanstack/history").RouterHistory;',
        ].join("\n"),
      },
    );
    expect(checkDeclarations(dir)).toEqual([
      {
        file: "dist/admin/react-router.d.ts",
        specifiers: ["@tanstack/router-core", "@tanstack/history"],
      },
    ]);
  });

  test("accepts a dependency, a peer, and the package's own name, by subpath too", () => {
    const dir = pkg(
      {
        name: "@plumix/plugin-seo",
        exports: { ".": { types: "./dist/index.d.ts" } },
        dependencies: { plumix: "workspace:*" },
        peerDependencies: { react: "^19" },
      },
      {
        "dist/index.d.ts": [
          'import type { PluginDescriptor } from "plumix/plugin";',
          'import type { ReactNode } from "react";',
          'export * from "@plumix/plugin-seo/admin";',
        ].join("\n"),
      },
    );
    expect(checkDeclarations(dir)).toEqual([]);
  });

  test("reports a package declared only as a devDependency", () => {
    const dir = pkg(
      {
        name: "plumix",
        exports: { ".": { types: "./dist/index.d.ts" } },
        devDependencies: { "@tanstack/router-core": "^1" },
      },
      {
        "dist/index.d.ts":
          'export declare const r: typeof import("@tanstack/router-core").redirect;',
      },
    );
    expect(checkDeclarations(dir)).toEqual([
      { file: "dist/index.d.ts", specifiers: ["@tanstack/router-core"] },
    ]);
  });

  test("ignores a declaration file no export reaches, as a plugin's admin chunk is", () => {
    const dir = pkg(
      {
        name: "@plumix/plugin-menu",
        exports: { ".": { types: "./dist/index.d.ts" } },
        dependencies: { plumix: "workspace:*" },
      },
      {
        "dist/index.d.ts": 'export declare const menu: import("plumix").P;',
        "dist/rpc.d.ts": 'import type { Router } from "@orpc/server";',
        "dist/admin/queries.d.ts": 'import type { R } from "../rpc.js";',
      },
    );
    expect(checkDeclarations(dir)).toEqual([]);
  });

  test("follows relative imports, re-exports and references to the files they load", () => {
    const dir = pkg(
      {
        name: "plumix",
        exports: { ".": { types: "./dist/index.d.ts" } },
      },
      {
        "dist/index.d.ts": [
          'import type { A } from "./a.js";',
          'export * from "./b.mjs";',
          'export type C = import("./c").C;',
          'export { D } from "./d.cjs";',
          '/// <reference path="e.d.ts" />',
          'import type { Missing } from "./missing.js";',
        ].join("\n"),
        "dist/a.d.ts": 'export type A = import("a-pkg").A;',
        "dist/b.d.mts": 'export type B = import("b-pkg").B;',
        "dist/c/index.d.ts": [
          'export type C = import("c-pkg").C;',
          'export * from "../a.js";',
        ].join("\n"),
        "dist/d.d.cts": 'export type D = import("d-pkg").D;',
        "dist/e.d.ts": 'declare const e: import("e-pkg").E;',
      },
    );
    expect(checkDeclarations(dir)).toEqual([
      { file: "dist/a.d.ts", specifiers: ["a-pkg"] },
      { file: "dist/b.d.mts", specifiers: ["b-pkg"] },
      { file: "dist/c/index.d.ts", specifiers: ["c-pkg"] },
      { file: "dist/d.d.cts", specifiers: ["d-pkg"] },
      { file: "dist/e.d.ts", specifiers: ["e-pkg"] },
    ]);
  });

  test("expands a wildcard export to the declaration files it matches", () => {
    const dir = pkg(
      {
        name: "@plumix/core",
        exports: {
          "./locales/*": {
            types: "./locales/*.d.mts",
            default: "./locales/*.mjs",
          },
        },
      },
      {
        "locales/en.d.mts": 'import type { Messages } from "@lingui/core";',
        "locales/pt/BR.d.mts": 'import type { Messages } from "@lingui/core";',
        "locales/en.mjs": 'import "@lingui/core";',
        "locales/notes.d.ts": 'import type { X } from "unmatched";',
      },
    );
    expect(checkDeclarations(dir)).toEqual([
      { file: "locales/en.d.mts", specifiers: ["@lingui/core"] },
      { file: "locales/pt/BR.d.mts", specifiers: ["@lingui/core"] },
    ]);
  });

  test("starts from a top-level `types` as well as `exports`", () => {
    const dir = pkg(
      { name: "legacy", types: "./dist/index.d.ts" },
      { "dist/index.d.ts": 'export type A = import("a-pkg").A;' },
    );
    expect(checkDeclarations(dir)).toEqual([
      { file: "dist/index.d.ts", specifiers: ["a-pkg"] },
    ]);
  });

  test("skips the platform modules an app supplies the types for", () => {
    const dir = pkg(
      {
        name: "@plumix/runtime-bun",
        exports: { ".": { types: "./dist/index.d.ts" } },
      },
      {
        "dist/index.d.ts": [
          'import type { Server } from "bun";',
          'import type { Database } from "bun:sqlite";',
          'import type { Env } from "cloudflare:workers";',
          'import type { Buffer } from "node:buffer";',
        ].join("\n"),
      },
    );
    expect(checkDeclarations(dir)).toEqual([]);
  });
});

describe("describeLeaks", () => {
  test("lists each file's specifiers and points an internal package at the façade", () => {
    expect(
      describeLeaks([
        {
          file: "dist/index.d.ts",
          specifiers: ["@plumix/core/blocks", "@plumix/admin-ui"],
        },
      ]),
    ).toBe(
      [
        "Declarations a consumer can load name packages this package does not declare:",
        "  dist/index.d.ts: @plumix/core/blocks, @plumix/admin-ui",
        "Annotate the export with the type from a `plumix` subpath, or publish the type on one.",
      ].join("\n"),
    );
  });

  test("points any other package at a type from a declared package, not at declaring it", () => {
    expect(
      describeLeaks([
        {
          file: "dist/admin/react-router.d.ts",
          specifiers: ["@tanstack/router-core"],
        },
      ]),
    ).toBe(
      [
        "Declarations a consumer can load name packages this package does not declare:",
        "  dist/admin/react-router.d.ts: @tanstack/router-core",
        "Annotate the export with a type from a package this one declares. Declaring a package no source file imports is not the fix: knip then calls it unused without a build.",
      ].join("\n"),
    );
  });
});
