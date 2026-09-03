import type { EnvInput } from "../../runtime/env-input.js";
import type {
  ConnectedObjectStorage,
  GetResult,
  HeadResult,
  ListItem,
  ListOptions,
  ListResult,
  ObjectBody,
  ObjectStorage,
  PresignedPutResult,
  PresignPutOptions,
  PutOptions,
  UrlOptions,
} from "../../runtime/slots.js";
import type { SigV4Credentials } from "./sigv4.js";
import { resolveEnvInput } from "../../runtime/env-input.js";
import { bodyToBytes, toFreshArrayBuffer } from "../body.js";
import { S3Error } from "./errors.js";
import {
  canonicalQueryString,
  DEFAULT_PRESIGN_TTL_SECONDS,
  EMPTY_PAYLOAD_HASH,
  encodePath,
  presignPutUrl,
  rfc3986Encode,
  sha256Hex,
  signRequest,
} from "./sigv4.js";

/** The key pair; the region comes from the slot config. */
export type S3Credentials = Omit<SigV4Credentials, "region">;

export interface S3Config {
  readonly bucket: string;
  /** The signing region: `auto` for R2, `us-east-1` for MinIO and GCS interop. */
  readonly region: string;
  /**
   * Service origin — `https://s3.eu-west-1.amazonaws.com`,
   * `https://<account>.r2.cloudflarestorage.com`, `http://localhost:9000`.
   * Objects are addressed path-style beneath it, `<endpoint>/<bucket>/<key>`,
   * which every S3-compatible store accepts.
   */
  readonly endpoint: string;
  /**
   * Literal credentials, or an `(env) => S3Credentials` resolver read from the
   * handler's env on connect — the form to use when the key pair is a secret.
   * On AWS the key needs `s3:ListBucket` as well as object permissions: without
   * it a missing object answers 403, which surfaces as an error, not `null`.
   */
  readonly credentials: EnvInput<S3Credentials>;
  /**
   * Public base URL for bucket objects (a CDN or custom domain in front of the
   * bucket). Absent, `url()` returns `null` and the media plugin serves objects
   * through its own route.
   */
  readonly publicUrlBase?: string;
  /** Defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
}

export interface S3ObjectStorage extends ObjectStorage {
  readonly config: S3Config;
}

const MAX_KEYS = 1000;

/**
 * Object storage over the S3 REST API — AWS S3, R2, MinIO, DigitalOcean
 * Spaces, GCS interop — on `fetch` plus the SigV4 signer, no AWS SDK.
 */
export function s3(config: S3Config): S3ObjectStorage {
  return {
    kind: "s3",
    config,
    connect(env): ConnectedObjectStorage {
      const credentials: SigV4Credentials = {
        ...resolveEnvInput(config.credentials, env),
        region: config.region,
      };
      const doFetch = config.fetch ?? fetch;
      const endpoint = config.endpoint.replace(/\/$/, "");
      const bucketUrl = `${endpoint}/${rfc3986Encode(config.bucket)}`;
      const objectUrl = (key: string): string =>
        `${bucketUrl}/${encodePath(key)}`;

      async function send(
        method: string,
        key: string | undefined,
        url: string,
        headers: Record<string, string> = {},
        body?: Uint8Array,
      ): Promise<Response> {
        const payload = body ? toFreshArrayBuffer(body) : undefined;
        const payloadHash = payload
          ? await sha256Hex(payload)
          : EMPTY_PAYLOAD_HASH;
        const signed = await signRequest({
          method,
          url,
          headers,
          payloadHash,
          credentials,
        });
        const response = await doFetch(url, {
          method,
          headers: signed,
          body: payload,
          // A wrong-region 301 must surface its own code, not the 403 the
          // hop would earn once the Authorization header is dropped.
          redirect: "manual",
        });
        if (response.ok) return response;
        throw S3Error.requestFailed({
          method,
          key,
          status: response.status,
          s3Code: await errorCodeOf(response),
        });
      }

      // A missing object is an answer, not a failure, for get, head and delete.
      async function sendOrNull(
        method: string,
        key: string,
        headers?: Record<string, string>,
      ): Promise<Response | null> {
        try {
          return await send(method, key, objectUrl(key), headers);
        } catch (error) {
          if (
            error instanceof S3Error &&
            error.status === 404 &&
            error.s3Code !== "NoSuchBucket"
          ) {
            return null;
          }
          throw error;
        }
      }

      return {
        async put(key, body: ObjectBody, opts?: PutOptions): Promise<void> {
          const headers: Record<string, string> = {};
          if (opts?.contentType) headers["content-type"] = opts.contentType;
          if (opts?.cacheControl) headers["cache-control"] = opts.cacheControl;
          for (const [name, value] of Object.entries(
            opts?.customMetadata ?? {},
          )) {
            headers[`x-amz-meta-${name}`] = value;
          }
          const response = await send(
            "PUT",
            key,
            objectUrl(key),
            headers,
            await bodyToBytes(body),
          );
          // Nothing to read, but an unconsumed body keeps the connection open.
          await response.arrayBuffer();
        },
        async get(key, opts): Promise<GetResult | null> {
          const headers: Record<string, string> = {};
          if (opts?.range) {
            const { offset, length } = opts.range;
            headers.range = `bytes=${String(offset)}-${String(offset + length - 1)}`;
          }
          const response = await sendOrNull("GET", key, headers);
          if (!response) return null;
          return {
            body: response.body ?? new ReadableStream<Uint8Array>(),
            ...metadataOf(response),
            arrayBuffer: () => response.arrayBuffer(),
          };
        },
        async head(key): Promise<HeadResult | null> {
          const response = await sendOrNull("HEAD", key);
          if (!response) return null;
          return metadataOf(response);
        },
        async delete(key): Promise<void> {
          // S3 answers 204 whether or not the key existed; a store that 404s
          // instead is still a successful delete.
          const response = await sendOrNull("DELETE", key);
          await response?.arrayBuffer();
        },
        async list(
          prefix?: string,
          opts: ListOptions = {},
        ): Promise<ListResult> {
          const query: Record<string, string> = {
            "list-type": "2",
            "max-keys": String(Math.min(opts.limit ?? MAX_KEYS, MAX_KEYS)),
          };
          if (prefix) query.prefix = prefix;
          if (opts.cursor) query["continuation-token"] = opts.cursor;
          if (opts.delimiter) query.delimiter = opts.delimiter;
          const response = await send(
            "GET",
            undefined,
            `${bucketUrl}?${canonicalQueryString(query)}`,
          );
          return parseListing(await response.text());
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        async url(key, _opts?: UrlOptions): Promise<string | null> {
          if (!config.publicUrlBase) return null;
          return `${config.publicUrlBase.replace(/\/$/, "")}/${encodePath(key)}`;
        },
        presignPut(
          key: string,
          opts: PresignPutOptions,
        ): Promise<PresignedPutResult> {
          return presignPutUrl({
            endpoint,
            bucket: config.bucket,
            key,
            contentType: opts.contentType,
            expiresIn: opts.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS,
            credentials,
          });
        },
      };
    },
  };
}

function metadataOf(response: Response): HeadResult {
  let customMetadata: Record<string, string> | undefined;
  for (const [name, value] of response.headers) {
    if (!name.startsWith("x-amz-meta-")) continue;
    customMetadata ??= {};
    customMetadata[name.slice("x-amz-meta-".length)] = value;
  }
  return {
    size: Number(response.headers.get("content-length") ?? 0),
    etag: response.headers.get("etag") ?? "",
    contentType: response.headers.get("content-type") ?? undefined,
    customMetadata,
  };
}

// Only the `<Code>` element is read off an error document. The rest of the
// body is the bucket's prose and never makes it into a message.
async function errorCodeOf(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => "");
  return elementText(text, "Code") || undefined;
}

// ListObjectsV2 answers in XML and no server runtime ships a parser for it;
// the document is flat enough that element extraction is the whole job.
function parseListing(xml: string): ListResult {
  const items: ListItem[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const contents = match[1] ?? "";
    items.push({
      key: decodeXml(elementText(contents, "Key")),
      size: Number(elementText(contents, "Size")),
      etag: decodeXml(elementText(contents, "ETag")),
      uploaded: new Date(elementText(contents, "LastModified")),
    });
  }
  const truncated = elementText(xml, "IsTruncated") === "true";
  const token = elementText(xml, "NextContinuationToken");
  return {
    items,
    cursor: truncated && token ? decodeXml(token) : undefined,
    truncated,
  };
}

function elementText(xml: string, name: string): string {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? "";
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function decodeXml(text: string): string {
  return text.replace(
    /&(?:amp|lt|gt|quot|apos|#39|#x[0-9a-fA-F]+|#\d+);/g,
    (entity) =>
      XML_ENTITIES[entity] ??
      String.fromCodePoint(
        entity.startsWith("&#x")
          ? Number.parseInt(entity.slice(3, -1), 16)
          : Number.parseInt(entity.slice(2, -1), 10),
      ),
  );
}
