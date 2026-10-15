import { describe, expect, test } from "vitest";

import { compileErrorToInfo } from "./compile-overlay.js";

describe("compileErrorToInfo", () => {
  test("maps message, plugin, location, and frame into DevErrorInfo", () => {
    const info = compileErrorToInfo({
      message: "Expected ';' but found 'const'",
      plugin: "vite:import-analysis",
      frame: "10 |  const x = 1\n   |  ^",
      loc: { file: "/proj/src/Counter.tsx", line: 10, column: 2 },
    });
    expect(info.name).toBe("Compile error · vite:import-analysis");
    expect(info.message).toBe("Expected ';' but found 'const'");
    expect(info.stack).toContain("/proj/src/Counter.tsx:10:2");
    expect(info.stack).toContain("const x = 1");
  });

  test("uses only the first line of a multi-line message as the header", () => {
    const info = compileErrorToInfo({
      message: "Transform failed with 1 error:\ndetail line\nmore detail",
    });
    expect(info.message).toBe("Transform failed with 1 error:");
    expect(info.name).toBe("Compile error");
  });

  test("falls back to the JS stack when no code frame is present", () => {
    const info = compileErrorToInfo({
      message: "Boom",
      stack: "Error: Boom\n    at load (x.ts:1:1)",
    });
    expect(info.stack).toContain("at load (x.ts:1:1)");
  });

  test("degrades to a bare name and message with no detail", () => {
    const info = compileErrorToInfo({ message: "Boom" });
    expect(info).toEqual({ name: "Compile error", message: "Boom" });
  });
});
