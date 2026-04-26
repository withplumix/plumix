import type {
  ConnectedObjectStorage,
  GetResult,
  ListOptions,
  ListResult,
  ObjectBody,
  ObjectStorage,
  PresignedPutResult,
  PresignPutOptions,
  PutOptions,
  UrlOptions,
} from "@plumix/core";

import { presignPutUrl } from "./sigv4.js";

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
  readonly publicUrlBase?: string;
  /**
   * S3-compatible credentials for presigned PUT URLs. Without this block,
   * `presignPut` throws "not configured" and consumers must accept that
   * uploads cannot bypass the worker. R2 native bindings cannot mint
   * presigned URLs — that's an S3-API-only capability.
   */
  readonly s3?: R2S3Credentials;
}

export interface R2ObjectStorage extends ObjectStorage {
  readonly config: R2Config;
}

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
  ): Promise<unknown>;
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
    throw new Error(
      `r2(): env is not an object — runtime adapter misconfiguration.`,
    );
  }
  const bucket = (env as Record<string, unknown>)[bindingName];
  if (
    bucket === null ||
    typeof bucket !== "object" ||
    typeof (bucket as { put?: unknown }).put !== "function"
  ) {
    throw new Error(
      `r2(): env binding "${bindingName}" is missing or not an R2 bucket. ` +
        `Declare it in wrangler.toml and ensure the name matches.`,
    );
  }
  return bucket as unknown as R2Bucket;
}

const DEFAULT_PRESIGN_TTL_SECONDS = 300;

export function r2(config: R2Config): R2ObjectStorage {
  return {
    kind: "r2",
    requiredBindings: [config.binding],
    config,
    connect(env): ConnectedObjectStorage {
      const bucket = readR2Binding(env, config.binding);
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
        async url(key, _opts?: UrlOptions): Promise<string> {
          if (!config.publicUrlBase) {
            throw new Error(
              `r2.url("${key}"): no publicUrlBase configured. Set ` +
                `r2({ binding, publicUrlBase: 'https://media.example.com' }) ` +
                `when the bucket is public, or route reads through a ` +
                `plugin-registered proxy endpoint.`,
            );
          }
          const base = config.publicUrlBase.endsWith("/")
            ? config.publicUrlBase.slice(0, -1)
            : config.publicUrlBase;
          return `${base}/${encodePath(key)}`;
        },
      };

      // Attach `presignPut` only when S3 credentials are configured —
      // R2 native bindings can't mint presigned URLs, so the optional
      // slot stays `undefined` if the consumer didn't opt in.
      if (config.s3) {
        const s3 = config.s3;
        connected.presignPut = async (
          key: string,
          opts: PresignPutOptions,
        ): Promise<PresignedPutResult> => {
          const endpoint =
            s3.endpoint ?? `https://${s3.accountId}.r2.cloudflarestorage.com`;
          return presignPutUrl({
            endpoint,
            bucket: s3.bucket,
            key,
            contentType: opts.contentType,
            expiresIn: opts.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS,
            credentials: {
              accessKeyId: s3.accessKeyId,
              secretAccessKey: s3.secretAccessKey,
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
