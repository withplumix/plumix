import { afterEach, describe, expect, test, vi } from "vitest";

import { buildApp } from "../runtime/app.js";
import { testConfig } from "../test/config.js";

afterEach(() => void vi.unstubAllEnvs());

describe("core's dev routes", () => {
  test("under plumix dev, the request history and the mail gallery register as development routes", async () => {
    vi.stubEnv("PLUMIX_DEV", "1");

    const app = await buildApp(testConfig());

    expect(
      app.rawRoutes.map(({ pluginId, method, path, auth }) => ({
        pluginId,
        method,
        path,
        auth,
      })),
    ).toEqual([
      {
        pluginId: "debug",
        method: "*",
        path: "/requests/*",
        auth: "development",
      },
      { pluginId: "debug", method: "*", path: "/mail/*", auth: "development" },
    ]);
  });

  test("outside plumix dev, none is registered", async () => {
    vi.stubEnv("PLUMIX_DEV", "");

    const app = await buildApp(testConfig());

    expect(app.rawRoutes).toEqual([]);
  });
});
