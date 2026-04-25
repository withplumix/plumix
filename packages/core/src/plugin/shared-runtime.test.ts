import { describe, expect, test } from "vitest";

import {
  buildSharedRuntimeImportMap,
  SHARED_RUNTIME_CHUNK_NAMES,
  SHARED_RUNTIME_SPECIFIERS,
} from "./shared-runtime.js";

describe("SHARED_RUNTIME_SPECIFIERS", () => {
  test("includes the load-bearing host packages plugin chunks rely on", () => {
    expect(SHARED_RUNTIME_SPECIFIERS).toEqual(
      expect.arrayContaining([
        "react",
        "react/jsx-runtime",
        "react-dom",
        "react-dom/client",
        "@tanstack/react-query",
        "@tanstack/react-router",
      ]),
    );
  });

  test("contains no duplicates", () => {
    const set = new Set(SHARED_RUNTIME_SPECIFIERS);
    expect(set.size).toBe(SHARED_RUNTIME_SPECIFIERS.length);
  });
});

describe("SHARED_RUNTIME_CHUNK_NAMES", () => {
  test("maps every specifier to a filename-safe chunk name", () => {
    for (const specifier of SHARED_RUNTIME_SPECIFIERS) {
      const chunk = SHARED_RUNTIME_CHUNK_NAMES[specifier];
      expect(chunk).toBeDefined();
      expect(chunk).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("chunk names are unique — one specifier per output file", () => {
    const chunks = Object.values(SHARED_RUNTIME_CHUNK_NAMES);
    expect(new Set(chunks).size).toBe(chunks.length);
  });
});

describe("buildSharedRuntimeImportMap", () => {
  test("maps every shared specifier to a stable vendor URL", () => {
    const { imports } = buildSharedRuntimeImportMap("/_plumix/admin");
    for (const specifier of SHARED_RUNTIME_SPECIFIERS) {
      expect(imports[specifier]).toMatch(
        /^\/_plumix\/admin\/vendor\/[a-z0-9-]+\.js$/,
      );
    }
  });

  test("each specifier resolves to a distinct URL", () => {
    const { imports } = buildSharedRuntimeImportMap("/_plumix/admin");
    const urls = Object.values(imports);
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("strips a trailing slash on the base path so URLs aren't doubled", () => {
    const { imports } = buildSharedRuntimeImportMap("/admin/");
    expect(imports.react).toBe("/admin/vendor/react.js");
  });

  test("works at the document root", () => {
    const { imports } = buildSharedRuntimeImportMap("");
    expect(imports.react).toBe("/vendor/react.js");
  });
});
