import type { Segment } from "../../access/contract/access.js";
import type { PlumixEnv } from "./bindings.js";

/**
 * Not JSON: the values are live drizzle table builders, which is why the module
 * is passed.
 */
export type SchemaModule = Record<string, unknown>;

export interface RequestScopedDbArgs {
  readonly env: PlumixEnv;
  readonly request: Request;
  readonly schema: SchemaModule;
  /**
   * The authenticator's `hasSession` verdict: "maybe signed in", not a
   * validated session.
   */
  readonly isAuthenticated: boolean;
  /** True when the request method is not GET/HEAD/OPTIONS. */
  readonly isWrite: boolean;
}

/**
 * No `close` seam: an adapter behind this hook must own its pooling and hand
 * out a borrowed handle, not a fresh connection.
 */
export interface RequestScopedDb {
  readonly db: unknown;
  /**
   * Called exactly once after the dispatcher returns, to attach per-request
   * state such as a bookmark cookie.
   */
  commit(response: Response): Response;
}

export interface ConnectedDb {
  readonly db: unknown;
  /**
   * Only on an adapter that owns a connection. A one-shot process needs it, or
   * a live socket keeps it from exiting.
   */
  readonly close?: () => void;
}

export interface DatabaseAdapter<TSchema = Record<string, unknown>> {
  readonly kind: string;
  /**
   * Called once per handler; `request` is the one that triggered the bind, not
   * a per-request input.
   */
  connect(env: PlumixEnv, request: Request, schema: TSchema): ConnectedDb;
  /**
   * Preferred over `connect` when present; `null` falls through to it. A
   * property so `this`-less references are safe.
   */
  readonly connectRequest?: (
    args: RequestScopedDbArgs,
  ) => RequestScopedDb | null;
  /**
   * Validated on first request. Omitting it opts out of the check; `[]` means
   * none needed.
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
  /**
   * Exact size of the PUT body in bytes. It is signed into the URL, so the
   * bucket refuses a body of any other length.
   */
  readonly contentLength: number;
  /** Default 300. */
  readonly expiresIn?: number;
}

export interface PresignedPutResult {
  readonly url: string;
  readonly method: "PUT";
  /**
   * Headers the client sets verbatim. `Content-Length` is not among them: the
   * client's HTTP stack sets it from the body.
   */
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
   * Half-open `[offset, offset+length)`. The result's `size` is unspecified for
   * a ranged read, since backends disagree.
   */
  readonly range?: { readonly offset: number; readonly length: number };
}

export interface ConnectedObjectStorage {
  put(key: string, body: ObjectBody, opts?: PutOptions): Promise<void>;
  get(key: string, opts?: GetOptions): Promise<GetResult | null>;
  head(key: string): Promise<HeadResult | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string, opts?: ListOptions): Promise<ListResult>;
  /**
   * `null` when the bucket isn't publicly addressable; the caller then mints a
   * worker-proxied URL.
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

export interface KV {
  readonly kind: string;
  readonly requiredBindings?: readonly string[];
  /** Called once per handler, so a client needs no hand-written memo. */
  connect(env: PlumixEnv): ConnectedKv;
}

/**
 * For a runtime whose own cache the {@link ConnectedCdn.decorate} headers can't
 * reach, as a Worker sits in front of its zone's cache.
 */
export interface CdnStore {
  match(request: Request): Promise<Response | undefined>;
  /**
   * Stores nothing for non-GET and drops `Set-Cookie`. Core hands over the
   * undecorated render; the provider re-headers it and may widen sharing.
   */
  put(
    request: Request,
    response: Response,
    tags: readonly string[],
  ): Promise<void>;
}

/**
 * Only {@link decorate} is required; each other member's absence is a supported
 * configuration.
 */
export interface ConnectedCdn {
  /**
   * May narrow sharing, never widen it: a `private`/`no-store` or `Set-Cookie`
   * response is returned untouched and untagged.
   */
  decorate(response: Response, tags: readonly string[]): Response;
  /**
   * A store without `purgeTags` expires entries only by TTL, so keep that TTL
   * short.
   */
  readonly store?: CdnStore;
  /**
   * Not yet called: core stamps `private, no-store` on every non-anonymous
   * render, which the first implementer must lift.
   */
  readonly segmentVary?: (response: Response, segment: Segment) => Response;
  /**
   * Absent, never a no-op, when the vendor can't purge by tag, so callers must
   * handle unpurgeable content.
   */
  readonly purgeTags?: (tags: readonly string[]) => Promise<void>;
}

/**
 * `connect` returns `null` to disable caching for the handler's life, such as a
 * deploy without zone credentials.
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
 * `url` is pure URL math. `connect` returns `undefined` for "no delivery" so
 * presence checks stay meaningful.
 */
export interface ImageDelivery {
  readonly kind: string;
  /**
   * Absent, the service fetches over the network, so a relative source comes
   * back untransformed.
   */
  readonly acceptsRelativeSources?: boolean;
  url(sourceUrl: string, opts?: TransformOpts): string;
  /**
   * Forgets every variant of `sourceUrl`, so the next request meets the
   * source's gating again.
   */
  purge?(sourceUrl: string): Promise<void>;
  /**
   * Carries `basePath` for an implementation whose `url()` points back at its
   * own route.
   */
  connect?(
    env: PlumixEnv,
    ctx?: { readonly basePath: string },
  ): ImageDelivery | undefined;
}

/**
 * Serves admin SPA deep links. Without it, deep-link requests 404 with a hint.
 */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}
