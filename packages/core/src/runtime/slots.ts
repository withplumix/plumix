import type { Segment } from "../access/policy.js";
import type { PlumixEnv } from "./bindings.js";

/**
 * A drizzle schema module as the consumer imports it — the namespace object
 * holding every table declaration. Not JSON: the values are drizzle table
 * builders, and the whole point of passing the module is to keep them live.
 */
export type SchemaModule = Record<string, unknown>;

export interface RequestScopedDbArgs {
  readonly env: PlumixEnv;
  readonly request: Request;
  readonly schema: SchemaModule;
  /**
   * The configured authenticator's `hasSession` verdict for this request.
   * Adapters should treat this as "maybe signed in" — use it to gate whether
   * per-request state (e.g. a bookmark cookie) is worth persisting. Not a
   * substitute for validating the session inside handlers.
   */
  readonly isAuthenticated: boolean;
  /** True when the request method is not GET/HEAD/OPTIONS. */
  readonly isWrite: boolean;
}

export interface RequestScopedDb {
  readonly db: unknown;
  /**
   * Called exactly once after the dispatcher returns. Attach per-request
   * state (e.g. a Set-Cookie header for the D1 Sessions API bookmark) to
   * the response and return it. Idempotent adapters may return `response`
   * unchanged.
   */
  commit(response: Response): Response;
}

export interface ConnectedDb {
  readonly db: unknown;
  /**
   * Release the connection. Provided only by an adapter that owns one — a
   * binding (D1) has nothing to release — and called by whoever asked for it,
   * once nothing will query it again.
   *
   * A one-shot process needs this: it exits when its event loop drains, and a
   * remote libsql client holds a live socket until it is closed, so a CronJob
   * pod would otherwise outlive the work it was started for.
   */
  readonly close?: () => void;
}

export interface DatabaseAdapter<TSchema = Record<string, unknown>> {
  readonly kind: string;
  /**
   * Bind the database. Called once per handler against the first invocation's
   * `env`, so an adapter that owns a connection pipeline does not need a memo
   * of its own. `request` is the request that triggered the bind, not a
   * per-request input — use {@link DatabaseAdapter.connectRequest} for that.
   */
  connect(env: PlumixEnv, request: Request, schema: TSchema): ConnectedDb;
  /**
   * Optional per-request database hook, and the only per-request seam a slot
   * gets: `connect` is called once per handler. When present, the handler
   * prefers this over `connect`: the returned `db` becomes `ctx.db` for the
   * request, and `commit` runs on the response path. Returning `null` means
   * "fall through to the once-bound `connect`" — useful when the adapter
   * is configured but the feature (e.g. Sessions API) is disabled.
   *
   * Declared as a property (not a method) so that `this`-less bare
   * references — common in test fixtures and wrappers — are safe.
   */
  readonly connectRequest?: (
    args: RequestScopedDbArgs,
  ) => RequestScopedDb | null;
  /**
   * Env bindings this adapter requires at runtime. Runtime adapters (CF,
   * Bun, Node) validate these against the actual env on first request so
   * a misconfigured deploy fails fast with a readable error instead of an
   * opaque 500 on the first query.
   *
   * Optional: adapters that don't consume runtime bindings (e.g. the test
   * stub) can omit. Populate as an empty array when explicitly "no bindings
   * needed"; omit to opt out of the check entirely.
   */
  readonly requiredBindings?: readonly string[];
}

export type ObjectBody =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | Blob
  | null;

export interface PutOptions {
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly cacheControl?: string;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export interface GetResult {
  readonly body: ReadableStream<Uint8Array>;
  readonly size: number;
  readonly contentType?: string;
  readonly etag: string;
  readonly customMetadata?: Readonly<Record<string, string>>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string;
  readonly delimiter?: string;
}

export interface ListItem {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly uploaded: Date;
}

export interface ListResult {
  readonly items: readonly ListItem[];
  readonly cursor?: string;
  readonly truncated: boolean;
}

export interface UrlOptions {
  readonly expiresIn?: number;
}

export interface PresignPutOptions {
  readonly contentType: string;
  readonly maxBytes?: number;
  /** Default 300. */
  readonly expiresIn?: number;
}

export interface PresignedPutResult {
  readonly url: string;
  readonly method: "PUT";
  readonly headers: Readonly<Record<string, string>>;
  /** Unix epoch seconds. */
  readonly expiresAt: number;
}

export interface HeadResult {
  readonly size: number;
  readonly contentType?: string;
  readonly etag: string;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export interface GetOptions {
  /**
   * Read only the given byte range from the object. Inclusive offset,
   * exclusive end (matches the `[offset, offset+length)` half-open
   * convention). Useful for magic-byte sniffing or partial-content
   * preview without fetching the whole body.
   *
   * The body is the window; `size` on the result is deliberately left
   * unspecified for a ranged read, because backends disagree — R2 reports the
   * whole object, the in-memory adapter the slice — and no caller reads it.
   * Take the length from the bytes.
   */
  readonly range?: { readonly offset: number; readonly length: number };
}

export interface ConnectedObjectStorage {
  put(key: string, body: ObjectBody, opts?: PutOptions): Promise<void>;
  get(key: string, opts?: GetOptions): Promise<GetResult | null>;
  /**
   * Object existence + lightweight metadata without fetching the body.
   * Plugins use this to verify a presigned PUT actually landed before
   * committing a draft media row to `published`. Returns `null` if the
   * object doesn't exist.
   */
  head(key: string): Promise<HeadResult | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string, opts?: ListOptions): Promise<ListResult>;
  /**
   * Resolve a public URL for the object, or `null` if the bucket isn't
   * publicly addressable (private bucket without a custom domain). When
   * null, the plugin layer is expected to mint a worker-proxied URL
   * (e.g. media plugin's `/_plumix/media/serve/<id>` route).
   */
  url(key: string, opts?: UrlOptions): Promise<string | null>;
  presignPut?(
    key: string,
    opts: PresignPutOptions,
  ): Promise<PresignedPutResult>;
}

export interface ObjectStorage {
  readonly kind: string;
  readonly requiredBindings?: readonly string[];
  /** Bound once per handler — see {@link KV.connect}. */
  connect(env: PlumixEnv): ConnectedObjectStorage;
}

export interface KvPutOptions {
  /**
   * Seconds until the entry expires. Backends may impose their own minimum —
   * Cloudflare Workers KV, for example, rejects TTLs under 60 seconds at write
   * time, while other stores accept any positive value.
   */
  readonly expirationTtl?: number;
}

export interface KvListOptions {
  readonly prefix?: string;
  readonly limit?: number;
  /** Opaque cursor from a prior {@link KvListResult} to resume pagination. */
  readonly cursor?: string;
}

export interface KvListResult {
  readonly keys: readonly string[];
  /** Present when more keys remain — pass back as `cursor` to continue. */
  readonly cursor?: string;
  readonly listComplete: boolean;
}

/**
 * A key/value store bound for the current request. String values only —
 * callers serialize (JSON, etc.) themselves.
 */
export interface ConnectedKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: KvPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: KvListOptions): Promise<KvListResult>;
}

/**
 * Key/value slot. Providers include `kv({ binding })` from
 * `@plumix/runtime-cloudflare` (a Workers KV namespace) and `memoryKv()`
 * (in-memory, for dev and tests); any backend — e.g. a Node runtime over
 * Redis — implements this same port.
 */
export interface KV {
  readonly kind: string;
  readonly requiredBindings?: readonly string[];
  /**
   * Bind the store. Called once per handler against the first invocation's
   * `env`, which is fixed for the handler's life, so an implementation that
   * builds a client does not need to memoise it by hand.
   */
  connect(env: PlumixEnv): ConnectedKv;
}

/**
 * An origin-side response store, present on a runtime that offers one.
 * Cloudflare Workers is the case that has one: a Worker runs in front of its
 * own zone's cache, so the headers {@link ConnectedCdn.decorate} emits do not
 * reach it (#2265). Every other CDN caches from those headers and has no
 * store.
 */
export interface CdnStore {
  match(request: Request): Promise<Response | undefined>;
  /**
   * Store `response` under `request`, tagged for
   * {@link ConnectedCdn.purgeTags}. A non-GET request stores nothing, and the
   * stored copy must not carry the response's `Set-Cookie` — both asserted by
   * the cdn conformance suite, which is where the rules are stated in full.
   *
   * The copy persisted here is served straight to a visitor on a hit, so it
   * must carry the freshness and tags a miss would leave with; core hands over
   * the undecorated render and the provider re-headers it. That is also where
   * this copy may widen sharing, which {@link ConnectedCdn.decorate} never
   * does: a separately keyed entry is what makes widening safe.
   */
  put(
    request: Request,
    response: Response,
    tags: readonly string[],
  ): Promise<void>;
}

/**
 * A CDN bound for the current isolate — a shared cache in front of the site.
 *
 * {@link decorate} is the only member every provider implements: it stamps the
 * freshness and cache tags on the response going back to the visitor, which is
 * how a page reaches a CDN the origin does not itself write to. The other three
 * are where vendors differ, and each one being absent is a supported
 * configuration rather than a broken provider.
 */
export interface ConnectedCdn {
  /**
   * Return the response the visitor receives, carrying whatever freshness and
   * cache-tag headers this vendor reads. Called for every shared-cacheable
   * public response, whether or not a {@link store} also holds a copy.
   *
   * Decoration may **narrow** sharing, never widen it, and the conformance
   * suite asserts every arm: a response that declared a shared-cacheable
   * freshness keeps it, a response that declared none is stamped with the
   * site's page freshness, and a response marked `private`/`no-store`, or
   * carrying a `Set-Cookie`, is returned untouched and untagged — that cookie
   * is the visitor's own and cannot be stripped the way {@link CdnStore.put}
   * strips it from a copy nobody else holds. Header names and the tag separator
   * are the provider's own — vendors disagree on both.
   */
  decorate(response: Response, tags: readonly string[]): Response;
  /**
   * Absent alongside `purgeTags` is a supported pair; a store *without* one is
   * the sharpest configuration this port allows, since an entry it holds is
   * then reachable only by expiry. Such a provider belongs on a short TTL.
   */
  readonly store?: CdnStore;
  /**
   * Present when the CDN can key its cache on an audience segment — a store the
   * provider keys itself, or a vendor that varies on a named cookie. Without
   * either, a non-anonymous segment bypasses the CDN rather than risk one
   * audience's page reaching another.
   *
   * Declared and not called: core stamps `private, no-store` on every
   * non-anonymous render's client copy, so the first provider to implement this
   * has to lift that stamping for itself before the member does anything.
   */
  readonly segmentVary?: (response: Response, segment: Segment) => Response;
  /**
   * Invalidate every cached response carrying any of `tags`. Absent when the
   * vendor cannot invalidate by tag — freshness is then the only control, and
   * such a site runs a short TTL rather than a long one.
   *
   * Optional in the type rather than a method that no-ops, so the compiler
   * forces every call site to handle absence: a purge that exists and quietly
   * does nothing would leave content cached and permanently unpurgeable with
   * every call reporting success.
   */
  readonly purgeTags?: (tags: readonly string[]) => Promise<void>;
}

/**
 * CDN slot. `connect` returns a {@link ConnectedCdn} when the
 * runtime has everything it needs to cache safely, or `null` to disable
 * caching for this deploy (e.g. a Cloudflare deploy with no zone credentials,
 * where pages must render live) — a verdict that holds for the handler's life.
 * Mirrors the `storage:` slot's connect shape.
 */
export interface CdnProvider {
  readonly kind: string;
  /** Bound once per handler — see {@link KV.connect}. */
  connect(env: PlumixEnv): ConnectedCdn | null;
}

export interface TransformOpts {
  readonly width?: number;
  readonly height?: number;
  readonly fit?: "cover" | "contain" | "scale-down";
  readonly quality?: number;
  readonly format?: "auto" | "webp" | "avif" | "jpeg";
  readonly dpr?: number;
}

/**
 * On-the-fly image delivery — pairs with `storage:` to serve resized /
 * format-converted images from a CDN. The contract is pure URL math: take
 * a source URL (already publicly reachable, typically through the bucket's
 * custom domain) plus `TransformOpts` and return the transformed URL.
 *
 * Optional `connect(env)`: an implementation whose config lives in the runtime
 * env (e.g. a zone from a Worker secret) binds against it once per handler,
 * returning `undefined` for "no delivery" so downstream presence checks stay
 * meaningful. The handler uses the bare object when `connect` is absent.
 */
export interface ImageDelivery {
  readonly kind: string;
  /**
   * The slot resolves a same-origin relative source (`/_plumix/media/serve/1`)
   * itself — an in-process transformer, such as the Node runtime's. Absent,
   * the transform service fetches the source over the network, so a caller
   * holding a relative URL hands it back untransformed.
   */
  readonly acceptsRelativeSources?: boolean;
  url(sourceUrl: string, opts?: TransformOpts): string;
  /**
   * Forget every variant rendered from `sourceUrl`, so the next request for
   * one resolves the source again and meets its gating. A slot that
   * transforms at the edge has nothing to forget and leaves this out.
   */
  purge?(sourceUrl: string): Promise<void>;
  /**
   * `ctx.basePath` is the site's resolved base path, so an implementation
   * whose `url()` points back at its own route (Node's `/_plumix/image`) can
   * prefix it the way every other outbound URL does. Off-origin delivery
   * (Cloudflare's) has no use for it. Optional so a slot constructed and
   * connected by hand, outside a handler bind, still type-checks.
   */
  connect?(
    env: PlumixEnv,
    ctx?: { readonly basePath: string },
  ): ImageDelivery | undefined;
}

/**
 * Runtime-provided static asset serving. Exposed so the core dispatcher can
 * serve admin SPA deep-links (`/_plumix/admin/<anything>`) by delegating
 * back to the platform's asset layer — Cloudflare's `env.ASSETS` binding
 * today, equivalents in future Node/Bun adapters. Omitted when the runtime
 * has no asset layer, in which case deep-link requests 404 with a hint.
 */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}
