import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { plumix } from "plumix";
import { auth as authConfig } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import * as schema from "plumix/schema";
import { applyCoreTestSchema } from "plumix/test";
import { defineTheme, fallback } from "plumix/theme";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { BunConfig } from "./adapter.js";
import { bun } from "./adapter.js";
import { bunSqlite } from "./bun-sqlite.js";
import { createBunSite } from "./site.js";

const CHUNK = "export const client = 1;";

const auth = authConfig({
  passkey: { rpName: "x", rpId: "localhost", origin: "http://localhost" },
});
const theme = defineTheme({ templates: [fallback(() => null)] });

const echo = definePlugin("echo", (ctx) => {
  ctx.registerPublicRoute({
    path: "/whoami",
    handler: (request, app) =>
      Response.json({ url: request.url, address: app.clientAddress ?? null }),
  });
});

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "plumix-bun-site-"));
  mkdirSync(join(dir, "dist/client/assets"), { recursive: true });
  writeFileSync(join(dir, "dist/client/assets/client-abc123.js"), CHUNK);
  await applyCoreTestSchema(
    bunSqlite({ path: join(dir, "site.sqlite") }).connect(
      {},
      new Request("http://localhost/"),
      schema,
    ).db,
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

// The site's serve options on a real `Bun.serve`, so the address and the URL
// are what Bun hands a request from a real socket.
async function served(
  config: BunConfig,
  body: (origin: string) => Promise<void>,
): Promise<void> {
  const site = createBunSite({
    config: plumix({
      runtime: bun(config),
      database: bunSqlite({ path: join(dir, "site.sqlite") }),
      auth,
      theme,
      plugins: [echo],
    }),
    assetManifest: {},
    entryUrl: pathToFileURL(join(dir, "dist/server/worker.js")).href,
  });
  const server = Bun.serve({ ...site.serve, port: 0, hostname: "127.0.0.1" });
  try {
    await body(`http://127.0.0.1:${String(server.port)}`);
  } finally {
    await server.stop(true);
    await site.dispose();
  }
}

const FORGED = {
  "x-forwarded-proto": "https",
  "x-forwarded-host": "cms.example",
  "x-forwarded-for": "198.51.100.1, 203.0.113.9",
};

describe("the site on Bun.serve", () => {
  test("with trustProxy off, forged forwarded headers are ignored and the address is the socket's", () =>
    served({}, async (origin) => {
      const response = await fetch(`${origin}/whoami?q=1`, {
        headers: FORGED,
      });
      expect(await response.json()).toEqual({
        url: `${origin}/whoami?q=1`,
        address: "127.0.0.1",
      });
    }));

  test("with trustProxy on, the forwarded scheme, host and rightmost address are honoured", () =>
    served({ trustProxy: true }, async (origin) => {
      const response = await fetch(`${origin}/whoami`, { headers: FORGED });
      expect(await response.json()).toEqual({
        url: "https://cms.example/whoami",
        address: "203.0.113.9",
      });
    }));

  test("a built asset is served ahead of the handler, and an unknown path falls through to it", () =>
    served({}, async (origin) => {
      const chunk = await fetch(`${origin}/assets/client-abc123.js`);
      expect(await chunk.text()).toBe(CHUNK);
      expect(chunk.headers.get("cache-control")).toContain("immutable");
      const fallthrough = await fetch(`${origin}/whoami`);
      expect(fallthrough.status).toBe(200);
    }));
});
