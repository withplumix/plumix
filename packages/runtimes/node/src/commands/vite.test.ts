import { describe, expect, test } from "vitest";

import { serverEnvironment } from "./vite.js";

describe("the server environment", () => {
  test("bundles everything but the native packages, without configuration", () => {
    const { resolve } = serverEnvironment({});
    expect(resolve?.noExternal).toBe(true);
    expect(resolve?.external).toEqual(
      expect.arrayContaining(["sharp", "better-sqlite3", "@libsql/client"]),
    );
  });

  test("keeps a consumer-declared package external beside the native ones", () => {
    const { resolve } = serverEnvironment({ external: ["my-native"] });
    expect(resolve?.external).toEqual(
      expect.arrayContaining(["sharp", "my-native"]),
    );
  });

  test("emits the entry as dist/server/worker.js and copies no public files", () => {
    const { consumer, build } = serverEnvironment({});
    expect(consumer).toBe("server");
    expect(build?.outDir).toBe("dist/server");
    expect(build?.copyPublicDir).toBe(false);
    expect(build?.rolldownOptions?.input).toBe(".plumix/worker.ts");
  });
});
