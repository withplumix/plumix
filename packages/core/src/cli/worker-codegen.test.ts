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

  test("reuses a single fetch handler across invocations", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("fetchHandler ??=");
  });

  test("exports a scheduled handler that delegates to runtime.buildScheduledHandler", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("async scheduled(event, env, ctx)");
    // Optional-chain so runtimes without scheduled support are a no-op.
    expect(source).toContain("config.runtime.buildScheduledHandler?.(app)");
  });

  test("reuses a single scheduled handler across invocations", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    expect(source).toContain("scheduledHandler ??=");
  });

  test("no-ops cleanly when the runtime omits buildScheduledHandler", () => {
    const source = generateWorkerSource({ configModule: "./config.ts" });
    // The generated code guards the call so a runtime that returns
    // undefined here doesn't blow up the scheduled invocation.
    expect(source).toContain("if (scheduledHandler) await scheduledHandler");
  });
});
