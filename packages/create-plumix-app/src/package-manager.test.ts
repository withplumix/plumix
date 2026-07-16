import { describe, expect, it } from "vitest";

import { detectPackageManager } from "./package-manager.js";

describe("detectPackageManager", () => {
  it("reads the manager from an npm_config_user_agent string", () => {
    expect(
      detectPackageManager("pnpm/8.15.0 npm/? node/v20.0.0 darwin arm64"),
    ).toBe("pnpm");
    expect(detectPackageManager("yarn/1.22.0 npm/? node/v20")).toBe("yarn");
    expect(detectPackageManager("bun/1.0.0 npm/? node/v20")).toBe("bun");
    expect(detectPackageManager("npm/10.0.0 node/v20")).toBe("npm");
  });

  it("falls back to npm for an unknown or missing agent", () => {
    expect(detectPackageManager("cnpm/1.0.0 node/v20")).toBe("npm");
    expect(detectPackageManager("")).toBe("npm");
    expect(detectPackageManager(undefined)).toBe("npm");
  });
});
