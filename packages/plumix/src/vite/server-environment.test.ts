import { describe, expect, test } from "vitest";

import { serverEnvironment } from "./server-environment.js";

const base = { entry: ".plumix/worker.ts", outDir: "dist/server" };

describe("the server environment", () => {
  test("bundles everything but the native packages, without additions", () => {
    const { resolve } = serverEnvironment(base);
    expect(resolve?.noExternal).toBe(true);
    expect(resolve?.external).toEqual(
      expect.arrayContaining(["sharp", "better-sqlite3", "@libsql/client"]),
    );
  });

  test("keeps a runtime's and a consumer's packages external beside the native ones", () => {
    const { resolve } = serverEnvironment({
      ...base,
      external: ["runtime-native", "my-native"],
    });
    expect(resolve?.external).toEqual(
      expect.arrayContaining(["sharp", "runtime-native", "my-native"]),
    );
  });

  test("emits the entry as worker.js in the output directory and copies no public files", () => {
    const { consumer, build } = serverEnvironment({
      entry: ".plumix/entry.ts",
      outDir: "out/server",
    });
    expect(consumer).toBe("server");
    expect(build?.outDir).toBe("out/server");
    expect(build?.copyPublicDir).toBe(false);
    expect(build?.rolldownOptions?.input).toBe(".plumix/entry.ts");
    expect(build?.rolldownOptions?.output).toMatchObject({
      entryFileNames: "worker.js",
    });
  });

  test("resolves with the runtime's conditions, and Vite's own when it names none", () => {
    expect(
      serverEnvironment({ ...base, conditions: ["worker", "node"] }).resolve
        ?.conditions,
    ).toEqual(["worker", "node"]);
    expect(serverEnvironment(base).resolve).not.toHaveProperty("conditions");
  });
});
