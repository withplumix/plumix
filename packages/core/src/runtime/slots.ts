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
   * Heuristic: true when the request carries a Plumix session cookie.
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

export interface DatabaseAdapter<TSchema = Record<string, unknown>> {
  readonly kind: string;
  /**
   * Bind the database. Called once per handler against the first invocation's
   * `env`, so an adapter that owns a connection pipeline does not need a memo
   * of its own. `request` is the request that triggered the bind, not a
   * per-request input — use {@link DatabaseAdapter.connectRequest} for that.
   */
  connect(
    env: PlumixEnv,
    request: Request,
    schema: TSchema,
  ): {
    db: unknown;
  };
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
 * An edge cache bound for the current isolate. Backs the public read-through
 * cache: `match` reads a stored response, `put` writes a fresh one tagged with
 * `tags`, and `purgeTags` invalidates every stored response carrying any of the
 * given tags. The canonical implementation (Cloudflare's `edge()`) is the
 * Workers Cache API plus the zone purge-by-tag REST API.
 */
export interface ConnectedCache {
  match(request: Request): Promise<Response | undefined>;
  put(
    request: Request,
    response: Response,
    tags: readonly string[],
  ): Promise<void>;
  purgeTags(tags: readonly string[]): Promise<void>;
}

/**
 * Edge-cache slot. `connect` returns a {@link ConnectedCache} when the
 * runtime has everything it needs to cache safely, or `null` to disable
 * caching for this deploy (e.g. a Cloudflare deploy with no zone credentials,
 * where pages must render live) — a verdict that holds for the handler's life.
 * Mirrors the `storage:` slot's connect shape.
 */
export interface CacheProvider {
  readonly kind: string;
  /** Bound once per handler — see {@link KV.connect}. */
  connect(env: PlumixEnv): ConnectedCache | null;
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
  url(sourceUrl: string, opts?: TransformOpts): string;
  connect?(env: PlumixEnv): ImageDelivery | undefined;
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
