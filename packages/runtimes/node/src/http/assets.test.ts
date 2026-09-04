import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeAssetsContract } from "plumix/test/conformance";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAssetsLayer } from "./assets.js";
import { listen } from "./test-support.js";

const SHELL = "<!doctype html><title>admin</title>";
const CHUNK = "export const admin = 1;";

// `chmod 000` does not stop root, so the unreadable-file cases need a user.
const unprivileged = process.getuid?.() !== 0;

let base: string;
let root: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "plumix-node-assets-"));
  root = join(base, "client");
  // Beside the root, so a traversal that resolved would find a file rather
  // than 404 by accident.
  writeFileSync(join(base, "outside.txt"), "outside");
  mkdirSync(join(root, "_plumix/admin/assets"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "_plumix/admin/index.html"), SHELL);
  writeFileSync(join(root, "_plumix/admin/assets/index-abc123.js"), CHUNK);
  writeFileSync(join(root, "assets/client-def456.js"), CHUNK);
  writeFileSync(join(root, "assets/unreadable-000000.js"), CHUNK);
  chmodSync(join(root, "assets/unreadable-000000.js"), 0o000);
  writeFileSync(join(root, ".env"), "SECRET=1");
  mkdirSync(join(root, ".well-known"), { recursive: true });
  writeFileSync(join(root, ".well-known/security.txt"), "Contact: x");
  writeFileSync(join(root, "café.txt"), "accent");
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describeAssetsContract({
  connect: () => createAssetsLayer({ root }),
  assetPath: "/_plumix/admin/assets/index-abc123.js",
  shellPath: "/_plumix/admin/",
  notFound: "404",
});

describe("the disk layer", () => {
  const layer = () => createAssetsLayer({ root });
  const get = (path: string, method = "GET") =>
    layer().fetch(new Request(`https://site.test${path}`, { method }));

  test("a traversal attempt never leaves the root", async () => {
    for (const path of [
      "/../outside.txt",
      "/assets/../../outside.txt",
      "/%2e%2e/outside.txt",
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  test("dotfiles are refused, .well-known excepted", async () => {
    expect((await get("/.env")).status).toBe(404);
    expect((await get("/.well-known/security.txt")).status).toBe(200);
  });

  test("a directory is held only through its trailing-slash index", async () => {
    expect((await get("/_plumix/admin")).status).toBe(404);
    expect(await (await get("/_plumix/admin/")).text()).toBe(SHELL);
  });

  test("a non-ASCII path and a fragment both resolve to the file", async () => {
    expect(await (await get(`/${encodeURIComponent("café")}.txt`)).text()).toBe(
      "accent",
    );
    expect(await (await get("/caf%C3%A9.txt#section")).text()).toBe("accent");
  });

  test("a held file carries its content type, and only /assets/ is immutable", async () => {
    const chunk = await get("/assets/client-def456.js");
    expect(chunk.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(chunk.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(
      (await get("/_plumix/admin/assets/index-abc123.js")).headers.get(
        "cache-control",
      ),
    ).toBeNull();
  });

  test.skipIf(!unprivileged)(
    "a file that fails to open answers 500 with no immutable header",
    async () => {
      const failed = await get("/assets/unreadable-000000.js");
      expect(failed.status).toBe(500);
      expect(failed.headers.get("cache-control")).toBeNull();
    },
  );

  test("HEAD answers with the headers and no body", async () => {
    const response = await get("/assets/client-def456.js", "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(CHUNK.length));
    expect(await response.text()).toBe("");
  });
});

describe("the layer as a Node middleware", () => {
  async function serve(): Promise<string> {
    const layer = createAssetsLayer({ root });
    const { origin } = await listen((req, res) => {
      layer.serve(req, res, () => {
        res.writeHead(418, { "content-type": "text/plain" }).end("handler");
      });
    });
    return origin;
  }

  test("streams a held file to the wire", async () => {
    const origin = await serve();
    const chunk = await fetch(`${origin}/assets/client-def456.js`);
    expect(chunk.status).toBe(200);
    expect(await chunk.text()).toBe(CHUNK);
  });

  test("hands a path it does not hold, and a non-GET, to the next handler", async () => {
    const origin = await serve();
    expect((await fetch(`${origin}/_plumix/rpc/x`)).status).toBe(418);
    expect((await fetch(`${origin}/.env`)).status).toBe(418);
    expect(
      (await fetch(`${origin}/assets/client-def456.js`, { method: "POST" }))
        .status,
    ).toBe(418);
  });
});
