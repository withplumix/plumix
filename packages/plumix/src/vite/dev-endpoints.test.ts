import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "vite";
import { afterAll, describe, expect, test } from "vitest";

import { DEV_ERROR_SOURCE_ENDPOINT } from "@plumix/core/dev-client";
import { MANIFEST_SCRIPT_ID } from "@plumix/core/manifest";

import { createDevEndpoints } from "./dev-endpoints.js";
import { plumix } from "./index.js";

const PRIVATE = "kept-out-of-every-dev-endpoint";

/** At module level, so the endpoint table below exists before collection. */
const site = realpathSync(mkdtempSync(join(tmpdir(), "plumix-dev-endpoints-")));
const en = `{ code: "en", label: "English", direction: "ltr", enabled: true }`;
writeFileSync(
  join(site, "plumix.config.ts"),
  `export default {
  runtime: { name: "x", handler: {}, generateEntry: () => "" },
  database: { kind: "x" },
  auth: { passkey: {} },
  theme: { templates: [] },
  plugins: [],
  i18n: { defaultLocale: ${en}, locales: [${en}] },
};
`,
);
const adminDir = join(site, "admin-dist");
mkdirSync(adminDir);
writeFileSync(
  join(adminDir, "index.html"),
  `<!doctype html><script id="${MANIFEST_SCRIPT_ID}" type="application/json">{}</script>`,
);
writeFileSync(
  join(adminDir, "catalog-locales.json"),
  JSON.stringify({
    sourceLocale: "en",
    catalogs: { admin: ["en"], editor: ["en"], blocks: ["en"] },
  }),
);
writeFileSync(join(site, "theme.ts"), "export const theme = 1;\n");
writeFileSync(join(site, ".env"), `SECRET=${PRIVATE}\n`);
mkdirSync(join(site, ".git"));
writeFileSync(join(site, ".git/config"), `[remote] url = ${PRIVATE}\n`);

const vite = await createServer({
  configFile: false,
  root: site,
  logLevel: "silent",
  appType: "custom",
  server: { middlewareMode: true },
  plugins: [
    plumix({
      configFile: join(site, "plumix.config.ts"),
      adminDir,
    }),
  ],
});
const http: Server = createHttpServer(vite.middlewares);
await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));

/** Every endpoint the plugin registers on the dev server. */
const endpoints = createDevEndpoints(vite);

afterAll(async () => {
  await new Promise((done) => http.close(done));
  await vite.close();
  rmSync(site, { recursive: true, force: true });
});

function request(path: string, init?: RequestInit): Promise<Response> {
  const { port } = http.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`, init);
}

/**
 * Each endpoint is asked about the file the way its method takes one: a `GET`
 * as a `file` query, a `POST` as a stack whose frame points at it.
 */
const probe = {
  GET: (endpoint: string, path: string) =>
    request(`${endpoint}?file=${encodeURIComponent(path)}&line=1`),
  POST: (endpoint: string, path: string) => {
    const stack = `Error: x\n    at f (${path}:1:1)`;
    return request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stack,
        logs: [{ kind: "exception", level: "error", message: "x", stack }],
      }),
    });
  },
};

describe("plumix's dev endpoints", () => {
  test("the source endpoint serves a file the dev server would serve", async () => {
    const file = encodeURIComponent(join(site, "theme.ts"));

    const response = await request(
      `${DEV_ERROR_SOURCE_ENDPOINT}?file=${file}&line=1`,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("export const theme = 1;");
  });

  test("the source endpoint answers 403 for a file server.fs.deny covers", async () => {
    const file = encodeURIComponent(join(site, ".env"));

    const response = await request(
      `${DEV_ERROR_SOURCE_ENDPOINT}?file=${file}&line=1`,
    );

    expect(response.status).toBe(403);
  });

  test.each(
    endpoints.flatMap(({ method, path }) =>
      [".env", ".git/config"].map((file) => ({ method, path, file })),
    ),
  )(
    "$method $path naming $file, which server.fs.deny covers, answers none of it",
    async ({ method, path, file }) => {
      const response = await probe[method](path, join(site, file));

      expect(await response.text()).not.toContain(PRIVATE);
    },
  );

  test("the source endpoint grants no other origin access to its answer", async () => {
    const file = encodeURIComponent(join(site, "theme.ts"));

    const response = await request(
      `${DEV_ERROR_SOURCE_ENDPOINT}?file=${file}&line=1`,
      { headers: { origin: "http://localhost:9999" } },
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
