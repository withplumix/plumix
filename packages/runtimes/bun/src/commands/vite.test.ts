import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serverEnvironment } from "plumix/vite";
import { resolveConfig } from "vite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { bun } from "../adapter.js";
import { bunServerEnvironment } from "./vite.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "plumix-bun-vite-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** The server environment as Vite resolves it for `plumix build`. */
async function resolvedServer() {
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      logLevel: "silent",
      environments: { server: serverEnvironment(bunServerEnvironment(bun())) },
    },
    "build",
  );
  return config.environments.server;
}

describe("the bun server bundle", () => {
  test("leaves bun: modules to Bun", async () => {
    const server = await resolvedServer();

    expect(server?.resolve.builtins).toContainEqual(/^bun:/);
  });

  // React's `bun` build of `react-dom/server` streams through Bun's
  // `type: "direct"` ReadableStream; the default build never does.
  test("resolves without the bun export condition", async () => {
    const server = await resolvedServer();

    expect(server?.resolve.conditions).not.toContain("bun");
  });
});
