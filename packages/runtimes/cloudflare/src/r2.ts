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

export interface R2Config {
  readonly binding: string;
  readonly publicUrlBase?: string;
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
  get(key: string): Promise<R2Object | null>;
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

export function r2(config: R2Config): R2ObjectStorage {
  return {
    kind: "r2",
    requiredBindings: [config.binding],
    config,
    connect(env): ConnectedObjectStorage {
      const bucket = readR2Binding(env, config.binding);
      return {
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
        async get(key): Promise<GetResult | null> {
          const obj = await bucket.get(key);
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
        // eslint-disable-next-line @typescript-eslint/require-await
        async presignPut(
          _key: string,
          _opts: PresignPutOptions,
        ): Promise<PresignedPutResult> {
          // SigV4 over Web Crypto is a focused follow-up; consumers
          // worker-proxy uploads via ctx.registerRoute + ctx.storage.put
          // until then.
          throw new Error(
            `r2.presignPut: not implemented yet. Use a plugin-registered ` +
              `raw POST route that calls ctx.storage.put(key, request.body) ` +
              `for worker-proxied uploads in the meantime.`,
          );
        },
      };
    },
  };
}

// `/` separators in keys survive — R2 stores them as literal chars.
function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
