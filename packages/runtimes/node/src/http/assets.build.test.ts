import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describeAssetsContract } from "plumix/test/conformance";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAssetsLayer } from "./assets.js";

// A consumer project in a temp dir with this package's `node_modules` linked
// in, built the way `plumix build` builds the client: the plumix plugin and
// Vite's builder, client environment only. The server half is a runtime
// command this package does not have yet.
const CONFIG = `import { auth, defineTheme, fallback, plumix } from "plumix";

export default plumix({
  runtime: { name: "stub", createHandler: () => ({ fetch: () => new Response("") }), generateEntry: () => "" },
  database: { kind: "stub", connect: () => ({ db: {} }) },
  auth: auth({ passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost:3000" } }),
  theme: defineTheme({ templates: [fallback(() => null)] }),
});
`;

type ViteManifest = Record<string, { readonly file: string }>;

let dir: string;
let assetPath = "";
const built = (async () => {
  dir = mkdtempSync(join(tmpdir(), "plumix-node-client-"));
  symlinkSync(
    fileURLToPath(new URL("../../node_modules", import.meta.url)),
    join(dir, "node_modules"),
  );
  const configFile = join(dir, "plumix.config.mjs");
  writeFileSync(configFile, CONFIG, "utf8");
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
