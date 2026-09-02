// Test support: an in-memory S3 reachable through `fetch`, and the SigV4
// verifier it authenticates with. The verifier recomputes every signature
// from the request as received — the way a real bucket does — with its own
// reading of the AWS spec rather than anything from `sigv4.ts`, so a signer
// bug and a matching verifier bug cannot cancel out. Excluded from the build.

import { toFreshArrayBuffer } from "../body.js";

export interface SigV4VerifierOptions {
  readonly credentials: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string;
  };
  readonly region: string;
  /** The server's clock; presigned URLs are checked for expiry against it. */
  readonly now?: Date;
}

export type SigV4Verdict =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

const ALGORITHM = "AWS4-HMAC-SHA256";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export async function verifySigV4(
  request: Request,
  options: SigV4VerifierOptions,
): Promise<SigV4Verdict> {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    return verifyHeaderAuth(request, url, authorization, options);
  }
  if (url.searchParams.has("X-Amz-Signature")) {
    return verifyQueryAuth(request, url, options);
  }
  return { ok: false, reason: "no SigV4 authentication on the request" };
}

const AUTHORIZATION =
  /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/([^/]+)\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/;

async function verifyHeaderAuth(
  request: Request,
  url: URL,
  authorization: string,
  options: SigV4VerifierOptions,
): Promise<SigV4Verdict> {
  const match = AUTHORIZATION.exec(authorization);
  if (!match) return { ok: false, reason: "malformed Authorization header" };
  const [, accessKeyId, dateStamp, region, service, signedHeaders, signature] =
    match;
  const amzDate = request.headers.get("x-amz-date");
  if (!amzDate?.startsWith(dateStamp ?? "")) {
    return {
      ok: false,
      reason: "x-amz-date does not match the credential scope",
    };
  }
  const payloadHash = request.headers.get("x-amz-content-sha256");
  if (payloadHash === null) {
    return { ok: false, reason: "x-amz-content-sha256 is required" };
  }
  const scope = checkScope(
    { accessKeyId, region, service, signedHeaders },
    options,
  );
  if (scope !== undefined) return { ok: false, reason: scope };
  const token = request.headers.get("x-amz-security-token");
  if ((options.credentials.sessionToken ?? null) !== token) {
    return { ok: false, reason: "x-amz-security-token does not match" };
  }
  if (
    token !== null &&
    !signedHeaders?.split(";").includes("x-amz-security-token")
  ) {
    return { ok: false, reason: "the session token is not signed" };
  }
  const canonicalHeaders = canonicalHeadersOf(
    request,
    url,
    signedHeaders ?? "",
  );
  if (canonicalHeaders === undefined) {
    return { ok: false, reason: "a signed header is missing from the request" };
  }
  const canonicalRequest = [
    request.method,
    canonicalPathOf(url),
    canonicalQueryOf(url, null),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const expected = await signatureOf(
    canonicalRequest,
    { amzDate, dateStamp: dateStamp ?? "", region: region ?? "" },
    options.credentials.secretAccessKey,
  );
  return expected === signature
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}

async function verifyQueryAuth(
  request: Request,
  url: URL,
  options: SigV4VerifierOptions,
): Promise<SigV4Verdict> {
  const q = url.searchParams;
  if (q.get("X-Amz-Algorithm") !== ALGORITHM) {
    return { ok: false, reason: "unsupported X-Amz-Algorithm" };
  }
  const credential = q.get("X-Amz-Credential")?.split("/") ?? [];
  const [accessKeyId, dateStamp, region, service, terminal] = credential;
  if (credential.length !== 5 || terminal !== "aws4_request") {
    return { ok: false, reason: "malformed X-Amz-Credential" };
  }
  const amzDate = q.get("X-Amz-Date") ?? "";
  const expires = Number(q.get("X-Amz-Expires"));
  const signedHeaders = q.get("X-Amz-SignedHeaders") ?? "";
  const signature = q.get("X-Amz-Signature");
  if (!amzDate.startsWith(dateStamp ?? "")) {
    return {
      ok: false,
      reason: "X-Amz-Date does not match the credential scope",
    };
  }
  const scope = checkScope(
    { accessKeyId, region, service, signedHeaders },
    options,
  );
  if (scope !== undefined) return { ok: false, reason: scope };
  if (
    (options.credentials.sessionToken ?? null) !== q.get("X-Amz-Security-Token")
  ) {
    return { ok: false, reason: "X-Amz-Security-Token does not match" };
  }
  const issued = parseAmzDate(amzDate);
  const now = options.now ?? new Date();
  if (!Number.isFinite(expires) || now.getTime() > issued + expires * 1000) {
    return { ok: false, reason: "the presigned URL has expired" };
  }
  const canonicalHeaders = canonicalHeadersOf(request, url, signedHeaders);
  if (canonicalHeaders === undefined) {
    return { ok: false, reason: "a signed header is missing from the request" };
  }
  const canonicalRequest = [
    request.method,
    canonicalPathOf(url),
    canonicalQueryOf(url, "X-Amz-Signature"),
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join("\n");
  const expected = await signatureOf(
    canonicalRequest,
    { amzDate, dateStamp: dateStamp ?? "", region: region ?? "" },
    options.credentials.secretAccessKey,
  );
  return expected === signature
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}

function checkScope(
  parsed: {
    accessKeyId: string | undefined;
    region: string | undefined;
    service: string | undefined;
    signedHeaders: string | undefined;
  },
  options: SigV4VerifierOptions,
): string | undefined {
  if (parsed.accessKeyId !== options.credentials.accessKeyId) {
    return "unknown access key id";
  }
  if (parsed.region !== options.region) return "wrong region in scope";
  if (parsed.service !== "s3") return "wrong service in scope";
  const names = (parsed.signedHeaders ?? "").split(";");
  if (!names.includes("host")) return "host is not among the signed headers";
  return undefined;
}

function canonicalHeadersOf(
  request: Request,
  url: URL,
  signedHeaders: string,
): string | undefined {
  const lines: string[] = [];
  for (const name of signedHeaders.split(";")) {
    const value = name === "host" ? url.host : request.headers.get(name);
    if (value === null) return undefined;
    // AWS: trim, then fold runs of whitespace inside the value to one space.
    lines.push(`${name}:${value.trim().split(/\s+/).join(" ")}`);
  }
  return `${lines.join("\n")}\n`;
}

// Each segment URI-encoded exactly once, from the decoded form.
function canonicalPathOf(url: URL): string {
  return url.pathname
    .split("/")
    .map((segment) => encode(decodeURIComponent(segment)))
    .join("/");
}

// Decoded then re-encoded, the way S3 canonicalises what it receives, so an
// equivalent encoding on the wire still verifies.
function canonicalQueryOf(url: URL, omit: string | null): string {
  const pairs: [string, string][] = [];
  for (const [name, value] of url.searchParams) {
    if (name !== omit) pairs.push([name, value]);
  }
  pairs.sort(([a, av], [b, bv]) => cmp(a, b) || cmp(av, bv));
  return pairs.map(([n, v]) => `${encode(n)}=${encode(v)}`).join("&");
}

function cmp(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

async function signatureOf(
  canonicalRequest: string,
  scope: { amzDate: string; dateStamp: string; region: string },
  secretAccessKey: string,
): Promise<string> {
  const stringToSign = [
    ALGORITHM,
    scope.amzDate,
    `${scope.dateStamp}/${scope.region}/s3/aws4_request`,
    await sha256Hex(utf8(canonicalRequest)),
  ].join("\n");
  let key = utf8(`AWS4${secretAccessKey}`);
  for (const part of [scope.dateStamp, scope.region, "s3", "aws4_request"]) {
    key = await hmac(key, part);
  }
  return hex(new Uint8Array(await hmac(key, stringToSign)));
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, utf8(data));
}

async function sha256Hex(data: BufferSource): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

function utf8(text: string): ArrayBuffer {
  const view = new TextEncoder().encode(text);
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// `20260426T112233Z` → epoch milliseconds.
function parseAmzDate(stamp: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y ?? 0, (mo ?? 1) - 1, d, h, mi, s);
}

interface FakeS3Object {
  readonly bytes: Uint8Array;
  readonly contentType: string | undefined;
  readonly cacheControl: string | undefined;
  readonly metadata: Readonly<Record<string, string>>;
  readonly etag: string;
  readonly uploaded: Date;
}

export interface FakeS3Options extends SigV4VerifierOptions {
  readonly bucket: string;
}

export interface FakeS3 {
  /** Stands in for the global `fetch`; hand it to `s3({ fetch })`. */
  readonly fetch: typeof fetch;
  readonly store: Map<string, FakeS3Object>;
  /** Every request received, in order — the last one is what a test inspects. */
  readonly requests: readonly Request[];
}

/**
 * An S3-compatible bucket in memory: path-style addressing, SigV4 on every
 * request (header or presigned query), ranged reads, user metadata, and
 * ListObjectsV2 with a continuation token.
 */
export function fakeS3(options: FakeS3Options): FakeS3 {
  const store = new Map<string, FakeS3Object>();
  const requests: Request[] = [];

  async function handle(request: Request): Promise<Response> {
    const verdict = await verifySigV4(request, options);
    if (!verdict.ok)
      return xmlError(403, "SignatureDoesNotMatch", verdict.reason);

    const url = new URL(request.url);
    const root = `/${options.bucket}`;
    if (url.pathname !== root && !url.pathname.startsWith(`${root}/`)) {
      return xmlError(404, "NoSuchBucket", url.pathname);
    }
    const key = decodeURIComponent(url.pathname.slice(root.length + 1));
    if (key === "") {
      if (
        request.method === "GET" &&
        url.searchParams.get("list-type") === "2"
      ) {
        return list(url.searchParams);
      }
      return xmlError(
        400,
        "InvalidRequest",
        "only ListObjectsV2 is served on the bucket",
      );
    }
    switch (request.method) {
      case "PUT":
        return put(key, request);
      case "GET":
        return get(key, request, true);
      case "HEAD":
        return get(key, request, false);
      case "DELETE":
        store.delete(key);
        return new Response(null, { status: 204 });
      default:
        return xmlError(405, "MethodNotAllowed", request.method);
    }
  }

  async function put(key: string, request: Request): Promise<Response> {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const declared = request.headers.get("x-amz-content-sha256");
    const actual = await sha256Hex(bytes);
    // A presigned PUT carries no payload header: its signature said UNSIGNED.
    if (
      declared !== null &&
      declared !== UNSIGNED_PAYLOAD &&
      declared !== actual
    ) {
      return xmlError(400, "XAmzContentSHA256Mismatch", "payload hash");
    }
    const metadata: Record<string, string> = {};
    for (const [name, value] of request.headers) {
      if (name.startsWith("x-amz-meta-")) {
        metadata[name.slice("x-amz-meta-".length)] = value;
      }
    }
    const etag = `"${actual}"`;
    store.set(key, {
      bytes,
      contentType: request.headers.get("content-type") ?? undefined,
      cacheControl: request.headers.get("cache-control") ?? undefined,
      metadata,
      etag,
      uploaded: new Date(),
    });
    return new Response(null, { status: 200, headers: { etag } });
  }

  function get(key: string, request: Request, withBody: boolean): Response {
    const entry = store.get(key);
    if (!entry) {
      return withBody
        ? xmlError(404, "NoSuchKey", key)
        : new Response(null, { status: 404 });
    }
    const headers = new Headers({
      etag: entry.etag,
      "last-modified": entry.uploaded.toUTCString(),
    });
    if (entry.contentType) headers.set("content-type", entry.contentType);
    if (entry.cacheControl) headers.set("cache-control", entry.cacheControl);
    for (const [name, value] of Object.entries(entry.metadata)) {
      headers.set(`x-amz-meta-${name}`, value);
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(
      request.headers.get("range") ?? "",
    );
    let body = entry.bytes;
    let status = 200;
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(Number(range[2]), entry.bytes.byteLength - 1);
      body = entry.bytes.subarray(start, end + 1);
      status = 206;
      headers.set(
        "content-range",
        `bytes ${String(start)}-${String(end)}/${String(entry.bytes.byteLength)}`,
      );
    }
    headers.set("content-length", String(body.byteLength));
    return new Response(withBody ? toFreshArrayBuffer(body) : null, {
      status,
      headers,
    });
  }

  function list(params: URLSearchParams): Response {
    const prefix = params.get("prefix") ?? "";
    const maxKeys = Number(params.get("max-keys") ?? "1000");
    const start = Number(params.get("continuation-token") ?? "0");
    const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
    const page = keys.slice(start, start + maxKeys);
    const next = start + page.length;
    const truncated = next < keys.length;
    const contents = page.map((key) => {
      const entry = store.get(key);
      return (
        `<Contents><Key>${escapeXml(key)}</Key>` +
        `<LastModified>${entry?.uploaded.toISOString() ?? ""}</LastModified>` +
        `<ETag>${escapeXml(entry?.etag ?? "")}</ETag>` +
        `<Size>${String(entry?.bytes.byteLength ?? 0)}</Size>` +
        `<StorageClass>STANDARD</StorageClass></Contents>`
      );
    });
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
      `<Name>${escapeXml(options.bucket)}</Name><Prefix>${escapeXml(prefix)}</Prefix>` +
      `<KeyCount>${String(page.length)}</KeyCount><MaxKeys>${String(maxKeys)}</MaxKeys>` +
      `<IsTruncated>${String(truncated)}</IsTruncated>` +
      (truncated
        ? `<NextContinuationToken>${String(next)}</NextContinuationToken>`
        : "") +
      contents.join("") +
      `</ListBucketResult>`;
    return new Response(xml, {
      status: 200,
      headers: { "content-type": "application/xml" },
    });
  }

  return {
    store,
    requests,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return handle(request);
    },
  };
}

function xmlError(status: number, code: string, message: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code>` +
      `<Message>${escapeXml(message)}</Message></Error>`,
    { status, headers: { "content-type": "application/xml" } },
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
