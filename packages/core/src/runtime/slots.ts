export interface RequestScopedDbArgs {
  readonly env: unknown;
  readonly request: Request;
  readonly schema: Record<string, unknown>;
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
  connect(
    env: unknown,
    request: Request,
    schema: TSchema,
  ): {
    db: unknown;
  };
  /**
   * Optional per-request database hook. When present, runtime adapters
   * prefer this over `connect`: the returned `db` becomes `ctx.db` for the
   * request, and `commit` runs on the response path. Returning `null` means
   * "fall through to `connect` for this request" — useful when the adapter
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

export interface ConnectedObjectStorage {
  put(key: string, body: ObjectBody, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<GetResult | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string, opts?: ListOptions): Promise<ListResult>;
  url(key: string, opts?: UrlOptions): Promise<string>;
  presignPut?(
    key: string,
    opts: PresignPutOptions,
  ): Promise<PresignedPutResult>;
}

export interface ObjectStorage {
  readonly kind: string;
  readonly requiredBindings?: readonly string[];
  connect(env: unknown): ConnectedObjectStorage;
}

export interface KV {
  readonly kind: string;
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
