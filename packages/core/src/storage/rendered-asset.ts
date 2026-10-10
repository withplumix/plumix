import type { ConnectedObjectStorage } from "../runtime/contract/slots.js";

/**
 * A content-addressed key names one immutable representation, so the bytes
 * behind it can be held for as long as a client cares to.
 */
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface RenderedAssetArgs {
  readonly request: Request;
  /**
   * Content-addressed: fold every input that changes the output into it, so
   * no invalidation pass is needed.
   */
  readonly key: string;
  /**
   * Served as declared under `nosniff`, so a type the browser treats as active
   * — `text/html`, `image/svg+xml` — runs on this origin. The caller chooses
   * it; nothing here narrows it.
   */
  readonly contentType: string;
  /**
   * Called once on a miss, never on a hit. Concurrent misses each render,
   * since a content-addressed key makes the write idempotent.
   */
  readonly render: () => Promise<Uint8Array>;
  /**
   * Absent when the deploy declared no `storage:` slot — the asset then renders
   * every request.
   */
  readonly storage?: ConnectedObjectStorage;
  /** Freshness for the served bytes. Defaults to a year, `immutable`. */
  readonly cacheControl?: string;
}

/**
 * Serve bytes that are expensive to produce: render once, keep the result,
 * serve it cheaply forever after.
 */
export async function serveRenderedAsset(
  args: RenderedAssetArgs,
): Promise<Response> {
  const {
    request,
    key,
    contentType,
    render,
    storage,
    cacheControl = IMMUTABLE_CACHE_CONTROL,
  } = args;
  const etag = etagForKey(key);

  // What a 304 has to repeat, so the client comes away with its stored entry
  // refreshed rather than merely revalidated.
  const revalidation = { etag, "cache-control": cacheControl };

  if (etagMatches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers: revalidation });
  }

  const respond = (body: BodyInit, size: number): Response =>
    new Response(body, {
      status: 200,
      headers: {
        ...revalidation,
        "content-type": contentType,
        "content-length": String(size),
        // The bytes came from a caller's renderer, not from a type the
        // browser negotiated; never let it guess a different one.
        "x-content-type-options": "nosniff",
      },
    });

  const stored = await storage?.get(key);
  if (stored) return respond(stored.body, stored.size);

  const bytes = await render();
  // Awaited where the edge cache defers: the write is small next to the render
  // that just paid for it, and a served asset is then always a persisted one.
  await storage?.put(key, bytes, { contentType, cacheControl });
  // A response body has to view a plain `ArrayBuffer`, which a rendered
  // `Uint8Array` is not guaranteed to be; `slice` copies into one.
  return respond(bytes.slice(), bytes.byteLength);
}

/**
 * A payload digest would disagree with the backend's own ETag. Percent-encoding
 * because RFC 9110 gives entity-tags no escape.
 */
function etagForKey(key: string): string {
  return `"${encodeURIComponent(key)}"`;
}

/** `*` isn't honoured: answering it would need a storage read. */
function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const normalize = (tag: string): string => tag.trim().replace(/^W\//, "");
  const target = normalize(etag);
  return ifNoneMatch.split(",").some((tag) => normalize(tag) === target);
}
