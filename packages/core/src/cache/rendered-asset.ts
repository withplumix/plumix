import type { ConnectedObjectStorage } from "../runtime/slots.js";

// A content-addressed key names one immutable representation, so the bytes
// behind it can be held for as long as a client cares to.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface RenderedAssetArgs {
  readonly request: Request;
  /**
   * Where the bytes live. Content-addressed by contract: the caller folds
   * every input that changes the output into it, so a changed input lands on
   * a new key instead of needing an invalidation pass.
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
  /** Absent when the deploy declared no `storage:` slot — the asset then renders every request. */
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

// The key is the one identity both paths share — a digest over the payload
// would disagree with whatever ETag the storage backend minted for the same
// bytes, and revalidation would then never match. Percent-encoding is what
// makes an arbitrary key a legal entity-tag: RFC 9110 gives the grammar no
// escape at all, so a quote or a comma has to leave rather than be escaped.
function etagForKey(key: string): string {
  return `"${encodeURIComponent(key)}"`;
}

// `If-None-Match` is a comma-separated list, and either side may be weak. The
// `*` form is not honoured: it asks whether the resource has any current
// representation, which the render path cannot answer without a storage read
// the served ETag has already made unnecessary.
function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const normalize = (tag: string): string => tag.trim().replace(/^W\//, "");
  const target = normalize(etag);
  return ifNoneMatch.split(",").some((tag) => normalize(tag) === target);
}
