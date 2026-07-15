import { describe, expect, test } from "vitest";

import { generateWorkerExportsSource } from "./worker-exports-codegen.js";

describe("generateWorkerExportsSource", () => {
  test("no contributions yields a module with no re-exports", () => {
    const source = generateWorkerExportsSource([]);
    expect(source).not.toContain("export * from");
    // Stays a module (not a script) so bundlers don't leak globals.
    expect(source).toContain("export {};");
  });

  test("re-exports every contributed specifier, escaped", () => {
    const source = generateWorkerExportsSource([
      "@plumix/runtime-cloudflare/demo",
      "./local/exports.ts",
    ]);
    expect(source).toContain(
      'export * from "@plumix/runtime-cloudflare/demo";',
    );
    expect(source).toContain('export * from "./local/exports.ts";');
    // No stray empty-module marker once there are real re-exports.
    expect(source).not.toContain("export {};");
  });
});
