import { serverEnvironment } from "plumix/vite";
import { describe, expect, test } from "vitest";

import { node } from "../adapter.js";
import { nodeServerEnvironment } from "./vite.js";

describe("the node server bundle", () => {
  test("inlines the site and leaves the packages it declares external to node", () => {
    const { resolve } = serverEnvironment(
      nodeServerEnvironment(node({ build: { external: ["my-native"] } })),
    );

    expect(resolve?.noExternal).toBe(true);
    expect(resolve?.external).toEqual(
      expect.arrayContaining(["sharp", "my-native"]),
    );
  });

  test("emits the generated entry as dist/server/worker.js and copies no public files", () => {
    const { build } = serverEnvironment(nodeServerEnvironment(node()));

    expect(build?.rolldownOptions?.input).toBe(".plumix/worker.ts");
    expect(build?.outDir).toBe("dist/server");
    expect(build?.rolldownOptions?.output).toMatchObject({
      entryFileNames: "worker.js",
    });
    expect(build?.copyPublicDir).toBe(false);
  });
});
