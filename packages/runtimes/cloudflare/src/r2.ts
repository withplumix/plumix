import type {
  ConnectedObjectStorage,
  EnvInput,
  GetResult,
  ListOptions,
  ListResult,
  ObjectBody,
  ObjectStorage,
  PresignedPutResult,
  PresignPutOptions,
  PutOptions,
  UrlOptions,
} from "plumix";
import { resolveEnvInput } from "plumix";
import { DEFAULT_PRESIGN_TTL_SECONDS, presignPutUrl } from "plumix/storage/s3";

import type { WorkerEnv } from "./read-env.js";
import { bucketNameKey, publicUrlBaseKey } from "./env-keys.js";
import { R2Error } from "./errors.js";
import { readEnvString } from "./read-env.js";

/**
 * S3-compatible credentials for R2 — required only when the application
 * needs presigned uploads. Without these, the binding-only path supports
 * server-side reads / writes / lists but `presignPut` is unavailable.
 */
export interface R2S3Credentials {
  /**
   * R2 bucket name as declared in `wrangler.toml`'s `r2_buckets[].bucket_name`.
   * Distinct from the binding handle — the S3 API addresses by bucket name.
   */
  readonly bucket: string;
  /** Cloudflare account id — forms the endpoint host. */
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Custom endpoint override. Defaults to `<accountId>.r2.cloudflarestorage.com`. */
  readonly endpoint?: string;
}

export interface R2Config {
  readonly binding: string;
  /**
   * Public base URL for bucket objects (a custom domain fronting R2). When
   * omitted, read from the `<BINDING>_PUBLIC_URL_BASE` request-env key so a
   * bare `r2({ binding })` still resolves public URLs once a domain is
   * attached. Absent both, `url()` returns `null`.
   */
  readonly publicUrlBase?: string;
  /**
   * S3-compatible credentials for presigned PUT URLs. R2 native bindings
   * cannot mint presigned URLs — that's an S3-API-only capability — so
   * `presignPut` is exposed only when credentials are available.
   *
   * Either literal credentials or an `(env) => R2S3Credentials` resolver, both
   * evaluated at presign (request) time. When omitted, credentials are read
   * from conventional request-env keys — `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   * `R2_SECRET_ACCESS_KEY`, and the binding-derived `<BINDING>_BUCKET` — and
   * `presignPut` stays undefined until all four are present.
   */
  readonly s3?: EnvInput<R2S3Credentials>;
}

export interface R2ObjectStorage extends ObjectStorage {
  readonly config: R2Config;
}

// The slice of the binding this adapter calls, and only that: `put` resolves
// to an object the adapter never reads, so the mirror says `void` rather than
// describing a shape nothing here checks.
interface R2Bucket {
  put(
    key: string,
    body:
      | ReadableStream<Uint8Array>
      | ArrayBuffer
      | ArrayBufferView
      | string
      | Blob
      | null,
    options?: {
      httpMetadata?: {
        contentType?: string;
        cacheControl?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ): Promise<void>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
    delimiter?: string;
  }): Promise<R2ListOutput>;
}

interface R2Object {
  body: ReadableStream<Uint8Array>;
  size: number;
  etag: string;
  httpEtag: string;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  customMetadata?: Record<string, string>;
  uploaded: Date;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2ListOutput {
  objects: {
    key: string;
    size: number;
    etag: string;
    uploaded: Date;
  }[];
  cursor?: string;
  truncated: boolean;
}

function readR2Binding(env: unknown, bindingName: string): R2Bucket {
  if (env === null || typeof env !== "object") {
    throw R2Error.envNotObject();
  }
  const bucket = (env as WorkerEnv)[bindingName];
  if (
    bucket === null ||
    typeof bucket !== "object" ||
    typeof (bucket as { put?: unknown }).put !== "function"
  ) {
    throw R2Error.bindingMissing({ binding: bindingName });
  }
  // Safety: the binding is a live Workers object the runtime injected, not
  // data — its shape is fixed by the platform, and the `put` probe above is
  // what distinguishes it from a name bound to something else.
  return bucket as unknown as R2Bucket;
}

export function r2(config: R2Config): R2ObjectStorage {
  return {
    kind: "r2",
    requiredBindings: [config.binding],
    config,
    connect(env): ConnectedObjectStorage {
      const bucket = readR2Binding(env, config.binding);
      const publicUrlBase =
        config.publicUrlBase ??
        readEnvString(env, publicUrlBaseKey(config.binding));
      const s3 = config.s3 ?? readConventionalS3(env, config.binding);
      const connected: ConnectedObjectStorage = {
        async put(key, body: ObjectBody, opts?: PutOptions): Promise<void> {
          await bucket.put(key, body, {
            httpMetadata: {
              contentType: opts?.contentType,
              cacheControl: opts?.cacheControl,
            },
            customMetadata: opts?.customMetadata
              ? { ...opts.customMetadata }
              : undefined,
          });
        },
        async get(key, opts): Promise<GetResult | null> {
          const obj = await bucket.get(
            key,
            opts?.range ? { range: opts.range } : undefined,
          );
          if (!obj) return null;
          return {
            body: obj.body,
            size: obj.size,
            // S3-shape quoted etag matches HTTP `If-None-Match` echoes verbatim.
            etag: obj.httpEtag || obj.etag,
            contentType: obj.httpMetadata?.contentType,
            customMetadata: obj.customMetadata,
            arrayBuffer: () => obj.arrayBuffer(),
          };
        },
        async head(key) {
          const obj = await bucket.head(key);
          if (!obj) return null;
          return {
            size: obj.size,
            etag: obj.httpEtag || obj.etag,
            contentType: obj.httpMetadata?.contentType,
            customMetadata: obj.customMetadata,
          };
        },
        async delete(key): Promise<void> {
          await bucket.delete(key);
        },
        async list(
          prefix?: string,
          opts: ListOptions = {},
        ): Promise<ListResult> {
          const out = await bucket.list({
            prefix,
            limit: opts.limit,
            cursor: opts.cursor,
            delimiter: opts.delimiter,
          });
          return {
            items: out.objects.map((o) => ({
              key: o.key,
              size: o.size,
              etag: o.etag,
              uploaded: o.uploaded,
            })),
            cursor: out.cursor,
            truncated: out.truncated,
          };
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        async url(key, _opts?: UrlOptions): Promise<string | null> {
          // Bucket-level public URL only — without a custom domain or
          // CDN base, returning the storage key directly would leak
          // unguessable-but-static keys publicly with no published-
          // status check. The consumer (media plugin) mints a
          // worker-proxied URL keyed on the entry id instead.
          if (!publicUrlBase) return null;
          const base = publicUrlBase.replace(/\/$/, "");
          return `${base}/${encodePath(key)}`;
        },
      };

      // Attach `presignPut` only when S3 credentials are available —
      // R2 native bindings can't mint presigned URLs, so the optional
      // slot stays `undefined` when neither an explicit `s3` block nor a
      // complete set of conventional env keys is present.
      if (s3) {
        const resolvedS3 = resolveEnvInput(s3, env);
        connected.presignPut = async (
          key: string,
          opts: PresignPutOptions,
        ): Promise<PresignedPutResult> => {
          const endpoint =
            resolvedS3.endpoint ??
            `https://${resolvedS3.accountId}.r2.cloudflarestorage.com`;
          return presignPutUrl({
            endpoint,
            bucket: resolvedS3.bucket,
            key,
            contentType: opts.contentType,
            expiresIn: opts.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS,
            credentials: {
              accessKeyId: resolvedS3.accessKeyId,
              secretAccessKey: resolvedS3.secretAccessKey,
              // The only region R2's S3 API signs for.
              region: "auto",
            },
          });
        };
      }

      return connected;
    },
  };
}

// `/` separators in keys survive — R2 stores them as literal chars.
function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

// All four or none: a partial set stays undefined (presign disabled), not a throw.
function readConventionalS3(
  env: unknown,
  binding: string,
): R2S3Credentials | undefined {
  const accountId = readEnvString(env, "CF_ACCOUNT_ID");
  const accessKeyId = readEnvString(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnvString(env, "R2_SECRET_ACCESS_KEY");
  const bucket = readEnvString(env, bucketNameKey(binding));
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return undefined;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}
