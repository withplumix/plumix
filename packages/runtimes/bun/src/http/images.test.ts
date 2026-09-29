import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { fakeImage } from "plumix/test";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import { images } from "../images.js";
import { createImageLayer } from "./images.js";

const ORIGIN = "http://site.test";

let base: string;
let png: Uint8Array<ArrayBuffer>;
let jpeg: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "plumix-bun-images-"));
  png = new Uint8Array(
    await fakeImage("pic.png", { width: 1200, height: 800 }).arrayBuffer(),
  );
  jpeg = new Uint8Array(
    await (await new Bun.Image(png).jpeg().blob()).arrayBuffer(),
  );
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

/** What the site behind the layer answers a same-origin source with. */
let originRequests: string[];
const answer = (body: Uint8Array<ArrayBuffer>, type: string) =>
  new Response(body, { headers: { "content-type": type } });
function originFetch(request: Request): Promise<Response> {
  originRequests.push(request.url);
  switch (new URL(request.url).pathname) {
    case "/pic.png":
      return Promise.resolve(answer(png, "image/png"));
    case "/photo.jpg":
      return Promise.resolve(answer(jpeg, "image/jpeg"));
    case "/gated.png":
      return Promise.resolve(new Response(null, { status: 401 }));
    case "/page":
      return Promise.resolve(
        new Response("<p>not an image</p>", {
          headers: { "content-type": "text/html" },
        }),
      );
    default:
      return Promise.resolve(new Response("Not Found", { status: 404 }));
  }
}

beforeEach(() => {
  originRequests = [];
});

const cacheDir = () => mkdtempSync(join(base, "cache-"));

function site(slot: ReturnType<typeof images>, basePath?: string) {
  slot.connect({}, { basePath: basePath ?? "" });
  const layer = createImageLayer(slot, { fetch: originFetch, basePath });
  return (path: string, headers: Record<string, string> = {}) =>
    layer.serve(new Request(`${ORIGIN}${path}`, { headers }), "127.0.0.1");
}

async function decoded(response: Response | null) {
  expect(response?.status).toBe(200);
  const bytes = new Uint8Array((await response?.arrayBuffer()) ?? []);
  return new Bun.Image(bytes).metadata();
}

describe("the /_plumix/image layer — resizing same-origin sources", () => {
  test("renders the roster width through the site's own fetch, keeping the aspect", async () => {
    const get = site(images({ cacheDir: cacheDir(), widths: [320, 640] }));
    const response = await get("/_plumix/image?src=/pic.png&w=600", {
      accept: "*/*",
    });
    expect(response?.headers.get("content-type")).toBe("image/png");
    expect(response?.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response?.headers.get("vary")).toBe("accept");
    const meta = await decoded(response);
    expect([meta.width, meta.height]).toEqual([640, 427]);
    expect(originRequests).toEqual([`${ORIGIN}/pic.png`]);
  });

  test("fits within a box with contain, and never enlarges", async () => {
    const get = site(images({ cacheDir: cacheDir(), widths: [320, 1920] }));
    const within = await decoded(
      await get("/_plumix/image?src=/pic.png&w=320&h=320&fit=contain"),
    );
    expect([within.width, within.height]).toEqual([320, 213]);
    const wide = await decoded(await get("/_plumix/image?src=/pic.png&w=1920"));
    expect([wide.width, wide.height]).toEqual([1200, 800]);
  });

  test("a gated source answers with the site's status, and one that is not an image is 415", async () => {
    const get = site(images({ cacheDir: cacheDir() }));
    expect((await get("/_plumix/image?src=/gated.png&w=320"))?.status).toBe(
      401,
    );
    expect((await get("/_plumix/image?src=/page&w=320"))?.status).toBe(415);
    expect((await get("/_plumix/image?w=320"))?.status).toBe(400);
  });

  test("leaves every other path, and a POST, to the handler", async () => {
    const slot = images({ cacheDir: cacheDir() });
    const layer = createImageLayer(slot, { fetch: originFetch });
    expect(await layer.serve(new Request(`${ORIGIN}/other`))).toBeNull();
    expect(
      await layer.serve(
        new Request(`${ORIGIN}/_plumix/image?src=/pic.png&w=320`, {
          method: "POST",
        }),
      ),
    ).toBeNull();
  });

  test("moves under basePath and refuses the route as its own source", async () => {
    const get = site(images({ cacheDir: cacheDir() }), "/cms");
    expect((await get("/cms/_plumix/image?src=/pic.png&w=320"))?.status).toBe(
      200,
    );
    expect(await get("/_plumix/image?src=/pic.png&w=320")).toBeNull();
    const nested = encodeURIComponent("/cms/_plumix/image?src=/pic.png&w=320");
    expect((await get(`/cms/_plumix/image?src=${nested}&w=320`))?.status).toBe(
      400,
    );
  });
});

describe("the /_plumix/image layer — format negotiation", () => {
  const backend = Bun.Image.backend;
  afterEach(() => {
    Bun.Image.backend = backend;
  });

  test("on a host without AVIF, an Accept that prefers AVIF gets WebP", async () => {
    // Bun's own codecs alone: what every Linux host has, and no AVIF.
    Bun.Image.backend = "bun";
    const get = site(images({ cacheDir: cacheDir() }));
    const response = await get("/_plumix/image?src=/pic.png&w=320", {
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    });
    expect(response?.headers.get("content-type")).toBe("image/webp");
    expect((await decoded(response)).format).toBe("webp");

    const explicit = await get("/_plumix/image?src=/pic.png&w=320&f=avif", {
      accept: "image/webp",
    });
    expect(explicit?.headers.get("content-type")).toBe("image/webp");
  });

  test("keeps the source type without a next-gen Accept, and honours an explicit format", async () => {
    const get = site(images({ cacheDir: cacheDir() }));
    const jpg = await get("/_plumix/image?src=/photo.jpg&w=320", {
      accept: "*/*",
    });
    expect(jpg?.headers.get("content-type")).toBe("image/jpeg");
    expect((await decoded(jpg)).format).toBe("jpeg");

    const explicit = await get("/_plumix/image?src=/pic.png&w=320&f=jpeg", {
      accept: "image/webp",
    });
    expect(explicit?.headers.get("content-type")).toBe("image/jpeg");
    expect((await decoded(explicit)).format).toBe("jpeg");
  });
});

describe("the /_plumix/image layer — remote sources", () => {
  let remote: Server<undefined>;
  let remoteHits: number;

  beforeAll(() => {
    remote = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        const { pathname } = new URL(request.url);
        const redirect = (location: string) =>
          new Response(null, { status: 302, headers: { location } });
        switch (pathname) {
          case "/r.png":
            remoteHits += 1;
            return answer(png, "image/png");
          case "/hop":
            return redirect("/r.png");
          case "/away":
            return redirect("http://localhost:1/r.png");
          case "/loop":
            return redirect("/loop");
          default:
            return new Response(null, { status: 500 });
        }
      },
    });
  });

  afterAll(async () => {
    await remote.stop(true);
  });

  beforeEach(() => {
    remoteHits = 0;
  });

  const allowing = (dir = cacheDir()) =>
    images({
      cacheDir: dir,
      remotePatterns: [{ hostname: "127.0.0.1", port: String(remote.port) }],
    });
  const remoteQuery = (path: string, width = 320) =>
    `/_plumix/image?src=${encodeURIComponent(`${remote.url.origin}${path}`)}&w=${String(width)}`;

  test("fetches a source matching remotePatterns and refuses one that does not", async () => {
    const get = site(allowing());
    expect((await decoded(await get(remoteQuery("/r.png")))).width).toBe(320);
    expect(remoteHits).toBe(1);

    const unlisted = site(images({ cacheDir: cacheDir() }));
    expect((await unlisted(remoteQuery("/r.png")))?.status).toBe(400);
    expect(remoteHits).toBe(1);
  });

  test("follows a redirect that stays permitted, refuses one that leaves, and caps the hops", async () => {
    const get = site(allowing());
    expect((await get(remoteQuery("/hop")))?.status).toBe(200);
    expect(remoteHits).toBe(1);
    expect((await get(remoteQuery("/away")))?.status).toBe(400);
    expect((await get(remoteQuery("/loop")))?.status).toBe(400);
  });

  test("serves the second request from the disk cache, and answers If-None-Match with 304", async () => {
    const dir = cacheDir();
    const get = site(allowing(dir));
    const query = remoteQuery("/r.png", 640);
    const first = await get(query, { accept: "image/webp" });
    const etag = first?.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    const bytes = new Uint8Array((await first?.arrayBuffer()) ?? []);
    expect(readdirSync(dir).some((name) => name.endsWith(".webp"))).toBe(true);

    const second = await get(query, { accept: "image/webp" });
    expect(second?.headers.get("etag")).toBe(etag);
    expect(new Uint8Array((await second?.arrayBuffer()) ?? [])).toEqual(bytes);

    const revalidated = await get(query, {
      accept: "image/webp",
      "if-none-match": `W/${etag}, "other"`,
    });
    expect(revalidated?.status).toBe(304);
    expect(await revalidated?.text()).toBe("");
    expect(remoteHits).toBe(1);
  });

  test("purge(source) drops that source's variants, so the next request meets it again", async () => {
    const dir = cacheDir();
    const slot = allowing(dir);
    const get = site(slot);
    await get(remoteQuery("/r.png"));
    await get(remoteQuery("/r.png", 640));
    expect(readdirSync(dir)).toHaveLength(2);

    await slot.purge(`${remote.url.origin}/r.png?v=2`);
    expect(readdirSync(dir)).toHaveLength(0);
    await get(remoteQuery("/r.png"));
    expect(remoteHits).toBe(3);
  });
});
