import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
