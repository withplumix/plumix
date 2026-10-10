import type { S3File } from "bun";
import type {
  ConnectedObjectStorage,
  EnvInput,
  GetResult,
  ListItem,
  ListResult,
  ObjectStorage,
} from "plumix";
import type { S3Credentials } from "plumix/storage/s3";
import { resolveEnvInput } from "plumix";
import {
  DEFAULT_PRESIGN_TTL_SECONDS,
  presignPutUrl,
  s3,
} from "plumix/storage/s3";

export interface BunS3Config {
  readonly bucket: string;
  /**
   * Service origin — `https://<account>.r2.cloudflarestorage.com`,
   * `http://localhost:9000`. Defaults to AWS S3 in `region`. Objects are
   * addressed path-style beneath it.
   */
  readonly endpoint?: string;
  /** The signing region: `auto` for R2. Defaults to `us-east-1`. */
  readonly region?: string;
  /**
   * Literal credentials, or an `(env) => S3Credentials` resolver read from the
   * handler's env on connect — the form to use when the key pair is a secret.
   */
  readonly credentials: EnvInput<S3Credentials>;
  /**
   * Public base URL for bucket objects (a CDN or custom domain in front of the
   * bucket). Absent, `url()` returns `null` and the media plugin serves objects
   * through its own route.
   */
  readonly publicUrlBase?: string;
}

export interface BunS3ObjectStorage extends ObjectStorage {
  readonly config: BunS3Config;
}

const DEFAULT_REGION = "us-east-1";
const MAX_KEYS = 1000;

// Opened on the first read, so a body nobody consumes sends no request.
function objectBody(source: S3File): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        reader ??= source.stream().getReader();
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel: (reason) => reader?.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}

/**
 * Core's portable `s3()` fills `put`, `head`, `presignPut` and `url`, where
 * Bun 1.4.2's `S3Client` drops metadata or headers. Without `publicUrlBase`,
 * `url()` is null and media proxies.
 */
export function bunS3(config: BunS3Config): BunS3ObjectStorage {
  return {
    kind: "s3",
    config,
    connect(env): ConnectedObjectStorage {
      const credentials = resolveEnvInput(config.credentials, env);
      const region = config.region ?? DEFAULT_REGION;
      const endpoint = config.endpoint ?? `https://s3.${region}.amazonaws.com`;
      const portable = s3({
        bucket: config.bucket,
        region,
        endpoint,
        credentials,
        publicUrlBase: config.publicUrlBase,
      }).connect(env);
      // Every field is given, so Bun's `S3_*`/`AWS_*` env lookup never picks
      // the account. Global, not imported, so the package root still loads
      // under Node.
      const client = new Bun.S3Client({
        bucket: config.bucket,
        region,
        endpoint,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      });

      return {
        put: (key, body, opts) => portable.put(key, body, opts),
        head: (key) => portable.head(key),

        async get(key, opts): Promise<GetResult | null> {
          const head = await portable.head(key);
          if (head === null) return null;
          const range = opts?.range;
          const size = range
            ? Math.max(0, Math.min(range.length, head.size - range.offset))
            : head.size;
          const file = client.file(key);
          // A window past the end is empty, which S3 answers 416 rather than
          // with no bytes.
          const body =
            size === 0
              ? new ReadableStream<Uint8Array>({ start: (c) => c.close() })
              : objectBody(
                  range ? file.slice(range.offset, range.offset + size) : file,
                );
          return {
            ...head,
            body,
            size,
            arrayBuffer: () => new Response(body).arrayBuffer(),
          };
        },

        async delete(key) {
          await client.delete(key);
        },

        async list(prefix, opts = {}): Promise<ListResult> {
          const page = await client.list({
            prefix,
            maxKeys: Math.min(opts.limit ?? MAX_KEYS, MAX_KEYS),
            continuationToken: opts.cursor,
            delimiter: opts.delimiter,
          });
          const items: ListItem[] = (page.contents ?? []).map((item) => ({
            key: item.key,
            size: item.size ?? 0,
            etag: item.eTag ?? "",
            uploaded: new Date(item.lastModified ?? 0),
          }));
          const truncated = page.isTruncated ?? false;
          return {
            items,
            cursor: truncated ? page.nextContinuationToken : undefined,
            truncated,
          };
        },

        url: (key, opts) => portable.url(key, opts),

        presignPut: (key, opts) =>
          presignPutUrl({
            endpoint: endpoint.replace(/\/$/, ""),
            bucket: config.bucket,
            key,
            contentType: opts.contentType,
            contentLength: opts.contentLength,
            expiresIn: opts.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS,
            credentials: { ...credentials, region },
          }),
      };
    },
  };
}
