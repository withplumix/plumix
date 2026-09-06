import { mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import sharp from "sharp";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { images } from "../images.js";
import { createImageLayer } from "./images.js";
import { listen } from "./test-support.js";

let cacheDir: string;
let png: Buffer;
let jpeg: Buffer;

beforeAll(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), "plumix-node-images-"));
  const source = sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#c33" },
  });
  png = await source.clone().png().toBuffer();
  jpeg = await source.clone().jpeg().toBuffer();
});

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

/** What the handler behind the layer answers a synthetic request with. */
let originRequests: string[];
const answer = (body: Buffer, type: string) =>
  new Response(new Uint8Array(body), { headers: { "content-type": type } });
function originResponse(pathname: string): Response {
  switch (pathname) {
    case "/pic.png":
    case "/pic2.png":
    case "/pic3.png":
      return answer(png, "image/png");
    case "/photo.jpg":
      return answer(jpeg, "image/jpeg");
    case "/gated.png":
      return new Response(null, { status: 401 });
    case "/truncated.jpg":
      // Its header decodes; its scan lines end early.
      return answer(jpeg.subarray(0, jpeg.byteLength >> 1), "image/jpeg");
    case "/page":
      return new Response("<p>not an image</p>", {
        headers: { "content-type": "text/html" },
      });
    default:
      return new Response("Not Found", { status: 404 });
  }
}
const originFetch = (request: Request): Response => {
  originRequests.push(request.url);
  return originResponse(new URL(request.url).pathname);
};

const fallthrough = (_req: IncomingMessage, res: ServerResponse): void => {
  res.statusCode = 404;
  res.end("fallthrough");
};

async function site(slot: ReturnType<typeof images>): Promise<string> {
  const layer = createImageLayer(slot, { fetch: originFetch });
  const { origin } = await listen((req, res) =>
    layer.serve(req, res, () => fallthrough(req, res)),
  );
  return origin;
}

const get = (
  origin: string,
  query: string,
  headers: Record<string, string> = {},
) => fetch(`${origin}/_plumix/image?${query}`, { headers });

async function decoded(response: Response) {
  return sharp(Buffer.from(await response.arrayBuffer())).metadata();
}

beforeEach(() => {
  originRequests = [];
});

describe("the /_plumix/image layer — same-origin sources", () => {
  test("transforms a same-origin source to the roster width, in the format Accept negotiates", async () => {
    const origin = await site(images({ cacheDir, widths: [320, 640, 1280] }));

    const avif = await get(origin, "src=/pic.png&w=640", {
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    });
    expect(avif.status).toBe(200);
    expect(avif.headers.get("content-type")).toBe("image/avif");
    expect(avif.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(avif.headers.get("vary")).toBe("accept");
    expect(avif.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/);
    const meta = await decoded(avif);
    expect(meta.format).toBe("heif");
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(427);
    // Resolved in-process, as a plain GET of the source path on this host.
    expect(originRequests).toEqual([`${origin}/pic.png`]);

    const webp = await get(origin, "src=/pic.png&w=640", {
      accept: "image/webp,*/*",
    });
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect((await decoded(webp)).format).toBe("webp");
  });

  test("keeps the source type when Accept offers neither avif nor webp, and honours an explicit format", async () => {
    const origin = await site(images({ cacheDir }));

    const png = await get(origin, "src=/pic.png&w=320", { accept: "*/*" });
    expect(png.headers.get("content-type")).toBe("image/png");
    expect((await decoded(png)).format).toBe("png");

    const jpg = await get(origin, "src=/photo.jpg&w=320", { accept: "*/*" });
    expect(jpg.headers.get("content-type")).toBe("image/jpeg");

    const explicit = await get(origin, "src=/pic.png&w=320&f=jpeg", {
      accept: "image/avif",
    });
    expect(explicit.headers.get("content-type")).toBe("image/jpeg");
    expect((await decoded(explicit)).format).toBe("jpeg");
  });

  test("a gated source answers with the status the handler gave it", async () => {
    const origin = await site(images({ cacheDir }));
    expect((await get(origin, "src=/gated.png&w=320")).status).toBe(401);
    expect((await get(origin, "src=/missing.png&w=320")).status).toBe(404);
  });

  test("a source that is not an image, or one that runs out mid-decode, is 415", async () => {
    const origin = await site(images({ cacheDir }));
    expect((await get(origin, "src=/page&w=320")).status).toBe(415);
    expect((await get(origin, "src=/truncated.jpg&w=320")).status).toBe(415);
  });

  test("the visitor's address travels with the synthetic request", async () => {
    const seen: (string | undefined)[] = [];
    const layer = createImageLayer(images({ cacheDir }), {
      fetch: (request, meta) => {
        seen.push(meta.clientAddress);
        return originFetch(request);
      },
    });
    const { origin } = await listen((req, res) =>
      layer.serve(req, res, () => fallthrough(req, res)),
    );
    await get(origin, "src=/pic.png&w=1024");
    expect(seen).toEqual(["127.0.0.1"]);
  });

  test("snaps an off-roster width, clamps quality and crops with a height", async () => {
    const origin = await site(images({ cacheDir, widths: [320, 768, 1280] }));

    const snapped = await get(origin, "src=/pic.png&w=700&q=999");
    expect(snapped.status).toBe(200);
    expect((await decoded(snapped)).width).toBe(768);
    expect((await get(origin, "src=/pic.png&w=0&q=0")).status).toBe(200);

    const crop = await get(origin, "src=/pic.png&w=320&h=100&fit=cover");
    const meta = await decoded(crop);
    expect([meta.width, meta.height]).toEqual([320, 100]);
    // `contain` fits within the box, as on the slot contract; no padding.
    const within = await decoded(
      await get(origin, "src=/pic.png&w=320&h=320&fit=contain"),
    );
    expect([within.width, within.height]).toEqual([320, 213]);
  });

  test("never enlarges: a source narrower than the roster keeps its own width", async () => {
    const origin = await site(images({ cacheDir, widths: [1920] }));
    expect(
      (await decoded(await get(origin, "src=/pic.png&w=1920"))).width,
    ).toBe(1200);
  });

  test("an absolute URL on this origin is resolved in-process too, and the route itself is refused as a source", async () => {
    const origin = await site(images({ cacheDir }));

    const own = await get(
      origin,
      `src=${encodeURIComponent(`${origin}/pic.png`)}&w=320`,
    );
    expect(own.status).toBe(200);
    expect(originRequests).toEqual([`${origin}/pic.png`]);

    const recursive = await get(
      origin,
      `src=${encodeURIComponent("/_plumix/image?src=/pic.png&w=320")}&w=320`,
    );
    expect(recursive.status).toBe(400);
    // Nor through the network, however the host is spelled.
    const viaHost = await get(
      origin,
      `src=${encodeURIComponent(`${origin}/_plumix/image?src=/pic.png&w=320`)}&w=320`,
    );
    expect(viaHost.status).toBe(400);
  });

  test("400 on a query it cannot read", async () => {
    const origin = await site(images({ cacheDir }));
    expect((await get(origin, "w=320")).status).toBe(400);
    expect((await get(origin, "src=/pic.png&w=abc")).status).toBe(400);
    expect((await get(origin, "src=/pic.png&f=bmp")).status).toBe(400);
    expect((await get(origin, "src=file:///etc/passwd&w=320")).status).toBe(
      400,
    );
  });

  test("HEAD carries the headers and no body; other methods and paths fall through", async () => {
    const origin = await site(images({ cacheDir }));

    const head = await fetch(`${origin}/_plumix/image?src=/pic.png&w=320`, {
      method: "HEAD",
    });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("image/png");
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
    expect(await head.text()).toBe("");

    const post = await fetch(`${origin}/_plumix/image?src=/pic.png&w=320`, {
      method: "POST",
    });
    expect(await post.text()).toBe("fallthrough");
    expect(await (await fetch(`${origin}/_plumix/other`)).text()).toBe(
      "fallthrough",
    );
  });
});

describe("the /_plumix/image layer — the cache", () => {
  const sourceHits = (path: string) =>
    originRequests.filter((u) => new URL(u).pathname === path).length;

  test("keeps the directory under cacheSize by dropping the least recently served variant", async () => {
    // One variant's size, learned from the route itself.
    const probe = await get(
      await site(images({ cacheDir: mkdtempSync(join(cacheDir, "probe-")) })),
      "src=/pic.png&w=320&f=webp",
    );
    const size = Number(probe.headers.get("content-length"));
    expect(size).toBeGreaterThan(0);

    const dir = mkdtempSync(join(cacheDir, "cap-"));
    const origin = await site(
      images({ cacheDir: dir, cacheSize: Math.floor(size * 2.5) }),
    );
    for (const src of ["/pic.png", "/pic2.png", "/pic3.png"]) {
      expect((await get(origin, `src=${src}&w=320&f=webp`)).status).toBe(200);
    }
    expect(readdirSync(dir)).toHaveLength(2);

    // The first one rendered is gone; the other two are hits.
    originRequests = [];
    await get(origin, "src=/pic2.png&w=320&f=webp");
    await get(origin, "src=/pic3.png&w=320&f=webp");
    expect(originRequests).toEqual([]);
    await get(origin, "src=/pic.png&w=320&f=webp");
    expect(sourceHits("/pic.png")).toBe(1);
    expect(readdirSync(dir)).toHaveLength(2);

    // Serving refreshes recency: pic3 was served after pic2, so pic2 went,
    // and pic3 outlives pic, which was rendered later but served earlier.
    originRequests = [];
    await get(origin, "src=/pic3.png&w=320&f=webp");
    await get(origin, "src=/pic2.png&w=320&f=webp");
    await get(origin, "src=/pic.png&w=320&f=webp");
    expect(
      ["/pic3.png", "/pic2.png", "/pic.png"].map((p) => sourceHits(p)),
    ).toEqual([0, 1, 1]);
  });

  test("a layer started over an existing directory counts it, least recently modified first", async () => {
    const dir = mkdtempSync(join(cacheDir, "restart-"));
    const files = () => readdirSync(dir).map((name) => join(dir, name));
    const before = await site(images({ cacheDir: dir }));
    const probe = await get(before, "src=/pic.png&w=320&f=webp");
    const size = Number(probe.headers.get("content-length"));
    const pic = files()[0] ?? "";
    await get(before, "src=/pic2.png&w=320&f=webp");
    const pic2 = files().find((f) => f !== pic) ?? "";
    // Rendered second, but on disk the older of the two.
    utimesSync(pic2, 1_000_000, 1_000_000);
    utimesSync(pic, 2_000_000, 2_000_000);

    const restarted = await site(
      images({ cacheDir: dir, cacheSize: Math.floor(size * 2.5) }),
    );
    await get(restarted, "src=/pic3.png&w=320&f=webp");
    expect(files()).toHaveLength(2);
    expect(files()).toContain(pic);
    originRequests = [];
    await get(restarted, "src=/pic.png&w=320&f=webp");
    expect(originRequests).toEqual([]);
  });

  test("purge(source) forgets that source's variants, with any query, and no other's", async () => {
    const dir = mkdtempSync(join(cacheDir, "purge-"));
    const slot = images({ cacheDir: dir });
    const origin = await site(slot);
    const variants = [
      "src=/pic.png&w=320",
      `src=${encodeURIComponent("/pic.png?v=2")}&w=320`,
      "src=/pic.png&w=640",
      `src=${encodeURIComponent(`${origin}/pic.png`)}&w=320`,
      "src=/pic2.png&w=320",
    ];
    for (const query of variants) {
      expect((await get(origin, query)).status).toBe(200);
    }
    expect(readdirSync(dir)).toHaveLength(5);

    const etag = (await get(origin, "src=/pic.png&w=320")).headers.get("etag");

    await slot.purge("/pic.png");
    expect(readdirSync(dir)).toHaveLength(1);
    // A revalidation is no longer answered from the hash alone: the source
    // is resolved again, and it is that answer the browser gets.
    const revalidated = await get(origin, "src=/pic.png&w=320", {
      "if-none-match": etag ?? "",
    });
    expect(revalidated.status).toBe(200);
    originRequests = [];
    for (const query of variants) {
      expect((await get(origin, query)).status).toBe(200);
    }
    expect(originRequests.map((u) => new URL(u).pathname)).toEqual([
      "/pic.png",
      "/pic.png",
      "/pic.png",
    ]);
  });

  test("a purge during a render wins: the variant that render made is not kept", async () => {
    const slot = images({ cacheDir: mkdtempSync(join(cacheDir, "race-")) });
    let open = (): void => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    let sourceReads = 0;
    const layer = createImageLayer(slot, {
      fetch: async () => {
        sourceReads += 1;
        await opened;
        return answer(png, "image/png");
      },
    });
    const { origin } = await listen((req, res) =>
      layer.serve(req, res, () => fallthrough(req, res)),
    );
    const first = get(origin, "src=/pic.png&w=320");
    await vi.waitFor(() => expect(sourceReads).toBe(1));
    await slot.purge("/pic.png");
    open();
    expect((await first).status).toBe(200);
    expect((await get(origin, "src=/pic.png&w=320")).status).toBe(200);
    expect(sourceReads).toBe(2);
  });
});

describe("the /_plumix/image layer — renders in flight", () => {
  test("renders as many variants at once as there are cores; the rest wait their turn", async () => {
    const limit = availableParallelism();
    let inflight = 0;
    let peak = 0;
    let open = (): void => undefined;
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    const layer = createImageLayer(
      images({ cacheDir: mkdtempSync(join(cacheDir, "inflight-")) }),
      {
        fetch: async () => {
          inflight += 1;
          peak = Math.max(peak, inflight);
          await opened;
          inflight -= 1;
          return answer(png, "image/png");
        },
      },
    );
    const { origin } = await listen((req, res) =>
      layer.serve(req, res, () => fallthrough(req, res)),
    );
    const responses = Array.from({ length: limit + 2 }, (_, i) =>
      get(origin, `src=/slow/${String(i)}.png&w=320`),
    );
    await vi.waitFor(() => expect(inflight).toBe(limit));
    open();
    for (const response of await Promise.all(responses)) {
      expect(response.status).toBe(200);
    }
    expect(peak).toBe(limit);
  });
});

describe("the /_plumix/image layer — remote sources", () => {
  let remoteHits: number;
  let remote: string;
  let remotePort: string;
  let elsewhere: string;

  beforeEach(async () => {
    remoteHits = 0;
    const other = await listen((_req, res) => {
      res.setHeader("content-type", "image/png");
      res.end(png);
    });
    elsewhere = other.origin;
    const server = await listen((req, res) => {
      const path = req.url ?? "/";
      if (path === "/r.png") {
        remoteHits += 1;
        res.setHeader("content-type", "image/png");
        res.end(png);
      } else if (path === "/hop") {
        res.writeHead(302, { location: "/r.png" }).end();
      } else if (path === "/away") {
        res.writeHead(302, { location: `${elsewhere}/r.png` }).end();
      } else if (path === "/loop") {
        res.writeHead(302, { location: "/loop" }).end();
      } else if (path === "/huge") {
        // Declared past the cap; never sent in full.
        res.writeHead(200, {
          "content-type": "image/png",
          "content-length": String(64 * 1024 * 1024),
        });
        res.write(png);
      } else {
        res.writeHead(500).end();
      }
    });
    remote = server.origin;
    remotePort = String(server.port);
  });

  const allowing = () =>
    images({
      cacheDir,
      remotePatterns: [{ hostname: "127.0.0.1", port: remotePort }],
    });

  test("fetches a source matching remotePatterns and refuses one that does not", async () => {
    const origin = await site(allowing());
    const allowed = await get(
      origin,
      `src=${encodeURIComponent(`${remote}/r.png`)}&w=320`,
    );
    expect(allowed.status).toBe(200);
    expect((await decoded(allowed)).width).toBe(320);
    expect(remoteHits).toBe(1);

    const refused = await get(
      origin,
      `src=${encodeURIComponent(`${elsewhere}/r.png`)}&w=320`,
    );
    expect(refused.status).toBe(400);
    expect(
      (
        await get(
          await site(images({ cacheDir })),
          `src=${encodeURIComponent(`${remote}/r.png`)}&w=320`,
        )
      ).status,
    ).toBe(400);
  });

  test("follows a redirect that stays permitted, refuses one that leaves, and caps the hops", async () => {
    const origin = await site(allowing());
    const hop = await get(
      origin,
      `src=${encodeURIComponent(`${remote}/hop`)}&w=320`,
    );
    expect(hop.status).toBe(200);
    expect(remoteHits).toBe(1);

    const away = await get(
      origin,
      `src=${encodeURIComponent(`${remote}/away`)}&w=320`,
    );
    expect(away.status).toBe(400);

    const loop = await get(
      origin,
      `src=${encodeURIComponent(`${remote}/loop`)}&w=320`,
    );
    expect(loop.status).toBe(400);
  });

  test("a permitted host that does not answer with the image is 502, and one that answers too much is 413", async () => {
    const origin = await site(allowing());
    const broken = await get(
      origin,
      `src=${encodeURIComponent(`${remote}/broken`)}&w=320`,
    );
    expect(broken.status).toBe(502);
    const huge = await get(
      origin,
      `src=${encodeURIComponent(`${remote}/huge`)}&w=320`,
    );
    expect(huge.status).toBe(413);
  });

  test("the second request for a variant is served from the cache, and If-None-Match answers 304", async () => {
    const origin = await site(allowing());
    const query = `src=${encodeURIComponent(`${remote}/r.png`)}&w=640`;
    const first = await get(origin, query, { accept: "image/webp" });
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toBeTruthy();
    const bytes = Buffer.from(await first.arrayBuffer());
    expect(remoteHits).toBe(1);
    expect(readdirSync(cacheDir).some((f) => f.endsWith(".webp"))).toBe(true);

    const second = await get(origin, query, { accept: "image/webp" });
    expect(second.status).toBe(200);
    expect(second.headers.get("etag")).toBe(etag);
    expect(Buffer.from(await second.arrayBuffer()).equals(bytes)).toBe(true);
    expect(remoteHits).toBe(1);

    const revalidated = await get(origin, query, {
      accept: "image/webp",
      "if-none-match": `W/${etag}, "other"`,
    });
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
    expect(remoteHits).toBe(1);
  });

  test("a source-typed variant is a cache hit as well, once its type is known", async () => {
    const origin = await site(allowing());
    const query = `src=${encodeURIComponent(`${remote}/r.png`)}&w=320`;
    await get(origin, query, { accept: "*/*" });
    const again = await get(origin, query, { accept: "*/*" });
    expect(again.headers.get("content-type")).toBe("image/png");
    expect(remoteHits).toBe(1);
  });
});

describe("the /_plumix/image layer — the assets binding", () => {
  test("a file the assets binding holds is a source ahead of the site", async () => {
    const assets = {
      fetch: (request: Request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/held.png"
            ? answer(png, "image/png")
            : new Response("Not Found", { status: 404 }),
        ),
    };
    // Its own cache: the source-typed `/pic.png` variant is rendered above.
    const layer = createImageLayer(
      images({ cacheDir: mkdtempSync(join(cacheDir, "assets-")) }),
      { assets, fetch: originFetch },
    );
    const { origin } = await listen((req, res) =>
      layer.serve(req, res, () => fallthrough(req, res)),
    );
    expect((await get(origin, "src=/held.png&w=320")).status).toBe(200);
    expect(originRequests).toEqual([]);
    expect((await get(origin, "src=/pic.png&w=320")).status).toBe(200);
    expect(originRequests).toEqual([`${origin}/pic.png`]);
  });
});

describe("createImageLayer without a Node images slot", () => {
  test("is a pass-through, so a Cloudflare slot or none at all changes nothing", async () => {
    const other = { kind: "cloudflare-images", url: (s: string) => s };
    for (const slot of [undefined, other]) {
      const layer = createImageLayer(slot, { fetch: originFetch });
      const { origin } = await listen((req, res) =>
        layer.serve(req, res, () => fallthrough(req, res)),
      );
      expect(await (await get(origin, "src=/pic.png&w=320")).text()).toBe(
        "fallthrough",
      );
    }
  });
});
