import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  checkDeclarations,
  findInternalSpecifiers,
} from "./check-declarations.mjs";

describe("findInternalSpecifiers", () => {
  test("reports an inferred type the compiler named through an internal package", () => {
    expect(
      findInternalSpecifiers(
        'export declare const pages: import("@plumix/core").PluginDescriptor<undefined>;',
      ),
    ).toEqual(["@plumix/core"]);
  });

  test("reports an internal subpath inside a `typeof import()`", () => {
    expect(
      findInternalSpecifiers(
        'type Ctx = AppContextBase<typeof import("@plumix/core/schema")>;',
      ),
    ).toEqual(["@plumix/core/schema"]);
  });

  test("reports import, re-export and triple-slash reference forms", () => {
    const source = [
      '/// <reference types="@plumix/admin-ui" />',
      'import type { BlockSpec } from "@plumix/blocks";',
      'export * from "@plumix/admin-editor";',
      "export { getRuntime } from '@plumix/admin';",
    ].join("\n");
    expect(findInternalSpecifiers(source)).toEqual([
      "@plumix/admin-ui",
      "@plumix/blocks",
      "@plumix/admin-editor",
      "@plumix/admin",
    ]);
  });

  test("ignores the façade and the published packages beside it", () => {
    const source = [
      'import type { PluginDescriptor } from "plumix/plugin";',
      'import type { OgImage } from "@plumix/plugin-seo";',
      'export declare const cf: import("@plumix/runtime-cloudflare").Adapter;',
      'type T = import("@plumix/core-extras").T;',
    ].join("\n");
    expect(findInternalSpecifiers(source)).toEqual([]);
  });

  test("ignores a specifier a doc comment only mentions", () => {
    const source = [
      "/**",
      ' * Prefer `import { definePlugin } from "plumix/plugin"` over',
      ' * `import("@plumix/core")`, which a consumer cannot resolve.',
      " */",
      'export declare const x: import("plumix").PluginDescriptor;',
    ].join("\n");
    expect(findInternalSpecifiers(source)).toEqual([]);
  });

  test("still reads code after a string holding `/*`, as a route pattern does", () => {
    const source = [
      'export declare const CARD_ROUTE_PATH = "/card/*";',
      'export declare const card: import("@plumix/core").RouteHandler;',
      "/** The prefix the route is mounted under. */",
      "export declare const PREFIX: string;",
    ].join("\n");
    expect(findInternalSpecifiers(source)).toEqual(["@plumix/core"]);
  });
});

describe("checkDeclarations", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  function dist(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "check-declarations-"));
    dirs.push(dir);
    for (const [file, source] of Object.entries(files)) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), source);
    }
    return dir;
  }

  test("names each declaration file that reaches an internal package", () => {
    const dir = dist({
      "index.d.ts": 'export declare const a: import("plumix").A;',
      "blocks/file/index.d.ts":
        'export declare const b: import("@plumix/blocks").BlockSpec;',
      "blocks/file/index.js": 'import("@plumix/blocks");',
      "rpc.d.ts": 'type C = typeof import("@plumix/core/schema");',
    });
    expect(checkDeclarations(dir)).toEqual([
      { file: "blocks/file/index.d.ts", specifiers: ["@plumix/blocks"] },
      { file: "rpc.d.ts", specifiers: ["@plumix/core/schema"] },
    ]);
  });
});
