import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeAssetsContract } from "plumix/test/conformance";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createAssetsLayer } from "./assets.js";

const SHELL = "<!doctype html><title>admin</title>";
const CHUNK = "export const admin = 1;";

let base: string;
let root: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "plumix-bun-assets-"));
  root = join(base, "client");
  mkdirSync(join(root, "_plumix/admin/assets"), { recursive: true });
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, ".well-known"), { recursive: true });
  writeFileSync(join(root, "_plumix/admin/index.html"), SHELL);
  writeFileSync(join(root, "_plumix/admin/assets/index-abc123.js"), CHUNK);
  writeFileSync(join(root, "assets/client-def456.js"), CHUNK);
  writeFileSync(join(root, "assets/with space-0a1b2c.js"), CHUNK);
  writeFileSync(join(root, ".well-known/security.txt"), "Contact: x");
  writeFileSync(join(root, ".env"), "SECRET=1");
  writeFileSync(join(base, "secret.txt"), "outside");
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

describe("the Bun.file layer", () => {
  const layer = () => createAssetsLayer({ root });
  const get = (path: string, method = "GET") =>
    layer().fetch(new Request(`https://site.test${path}`, { method }));

  test("a directory is held only through its trailing-slash index", async () => {
    expect((await get("/_plumix/admin")).status).toBe(404);
    expect(await (await get("/_plumix/admin/")).text()).toBe(SHELL);
  });

  test("a held file carries the headers the shared rules decide", async () => {
    const chunk = await get("/assets/client-def456.js");
    expect(await chunk.text()).toBe(CHUNK);
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

  test("HEAD answers with the headers and no body", async () => {
    const response = await get("/assets/client-def456.js", "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(CHUNK.length));
    expect(await response.text()).toBe("");
  });

  test("a percent-encoded path is matched on its decoded form", async () => {
    const response = await get("/assets/with%20space-0a1b2c.js");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CHUNK);
    expect((await get("/.well-known/security.txt")).status).toBe(200);
  });

  test("traversal, encoded traversal, dotfiles and an undecodable path all 404", async () => {
    for (const path of [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/assets/..%2f..%2fsecret.txt",
      "/assets/%2e%2e%2f%2e%2e%2fsecret.txt",
      "/.env",
      "/%2eenv",
      "/assets/%E0%A4%A.js",
      "/assets\\..\\..\\secret.txt",
    ]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });

  test("a file removed after it was served is no longer held", async () => {
    const file = join(root, "assets/gone-111111.js");
    writeFileSync(file, CHUNK);
    const held = layer();
    const url = "https://site.test/assets/gone-111111.js";
    expect((await held.fetch(new Request(url))).status).toBe(200);
    rmSync(file);
    expect((await held.fetch(new Request(url))).status).toBe(404);
  });

  test("serve() answers null for a path the layer does not hold, and for a non-GET", async () => {
    const held = layer();
    expect(
      await held.serve(new Request("https://site.test/_plumix/rpc/x")),
    ).toBeNull();
    expect(
      await held.serve(
        new Request("https://site.test/assets/client-def456.js", {
          method: "POST",
        }),
      ),
    ).toBeNull();
    const served = await held.serve(
      new Request("https://site.test/assets/client-def456.js"),
    );
    expect(await served?.text()).toBe(CHUNK);
  });
});
