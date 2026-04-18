import { describe, expect, test } from "vitest";

import { generateWorkerSource } from "./worker-codegen.js";

describe("generateWorkerSource", () => {
  test("imports the user config from the configured module specifier", () => {
    const source = generateWorkerSource({
      configModule: "../plumix.config.ts",
    });
    expect(source).toContain('import config from "../plumix.config.ts";');
  });

  test("escapes weird specifiers via JSON.stringify", () => {
    const source = generateWorkerSource({
      configModule: "./path with spaces/config.ts",
    });
    expect(source).toContain(
      'import config from "./path with spaces/config.ts";',
    );
  });

  test("exports a fetch handler default export", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("export default");
    expect(source).toContain("async fetch(request, env, ctx)");
  });

  test("reuses a single handler across invocations", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("handler ??=");
  });
});
