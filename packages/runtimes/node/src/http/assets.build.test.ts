import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describeAssetsContract } from "plumix/test/conformance";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  scaffoldConsumerProject,
  STUB_CONFIG,
} from "../test/consumer-project.js";
import { createAssetsLayer } from "./assets.js";

// Built the way `plumix build` builds the client: the plumix plugin and
// Vite's builder, client environment only, into the outDir the Node build
// command uses.
type ViteManifest = Record<string, { readonly file: string }>;

let dir: string;
let assetPath = "";
const built = (async () => {
  dir = scaffoldConsumerProject("plumix-node-client-", STUB_CONFIG);
  const configFile = join(dir, "plumix.config.mjs");
  const { createBuilder } = await import("vite");
  const { emitPlumixSources, plumix } = await import("plumix/vite");
  await emitPlumixSources(dir, configFile);
  const builder = await createBuilder({
    configFile: false,
    root: dir,
    logLevel: "silent",
    plugins: [plumix({ configFile })],
    // Where the runtime's build command puts the client, beside `dist/server`.
    environments: { client: { build: { outDir: "dist/client" } } },
  });
  const client = builder.environments.client;
  if (!client)
    throw new Error("the plumix plugin declared no client environment");
  await builder.build(client);
  const root = join(dir, "dist/client");
  const manifest = JSON.parse(
    readFileSync(join(root, ".vite/manifest.json"), "utf8"),
  ) as ViteManifest;
  const entry = Object.entries(manifest).find(([key]) =>
    key.endsWith("client-entry.ts"),
  );
  if (!entry) throw new Error("no client entry in the Vite manifest");
  assetPath = `/${entry[1].file}`;
  return root;
})();

beforeAll(() => built, 120_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeAssetsContract({
  connect: async () => createAssetsLayer({ root: await built }),
  // Filled in once the build has run; the suite reads it per case.
  get assetPath() {
    return assetPath;
  },
  shellPath: "/_plumix/admin/",
  notFound: "404",
});

describe("over the built client directory", () => {
  test("the hashed client chunk is immutable and the admin shell is not", async () => {
    const layer = createAssetsLayer({ root: await built });
    const chunk = await layer.fetch(
      new Request(`https://site.test${assetPath}`),
    );
    expect(chunk.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const shell = await layer.fetch(
      new Request("https://site.test/_plumix/admin/"),
    );
    expect(shell.headers.get("cache-control")).toBeNull();
  });

  test("a traversal out of dist/client and a dotfile inside it both 404", async () => {
    const layer = createAssetsLayer({ root: await built });
    for (const path of ["/../../plumix.config.mjs", "/.vite/manifest.json"]) {
      const response = await layer.fetch(
        new Request(`https://site.test${path}`),
      );
      expect(response.status, path).toBe(404);
    }
  });
});
