// AWS SigV4 in both of its forms: query-string presigning, where a browser
// PUTs straight to the returned URL, and header signing, which the `s3()` slot
// uses for its own requests. Hand-rolled on Web Crypto so a bundle that only
// needs to mint a URL does not pull the AWS SDK (~40 KB gz).
//
// References:
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-auth-using-authorization-header.html

import { SigV4Error } from "./errors.js";

export interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Temporary (STS) credentials carry one; it travels as `X-Amz-Security-Token`. */
  readonly sessionToken?: string;
  /** The signing region — `auto` for R2, the bucket's region on AWS. */
  readonly region: string;
}

export interface PresignPutInput {
  /** Full bucket origin, e.g. `https://<account>.r2.cloudflarestorage.com`. */
  readonly endpoint: string;
  /** Bucket name — appended to the path between origin and key. */
  readonly bucket: string;
  /** Object key — encoded segment by segment, `/` kept as the separator. */
  readonly key: string;
  /** Mime signed into the canonical request — browser must echo. */
  readonly contentType: string;
  /** Seconds until the URL expires; outside AWS's 1..604800 range it throws. */
  readonly expiresIn: number;
  readonly credentials: SigV4Credentials;
  /** Override "now" — used by tests for deterministic signatures. */
  readonly now?: Date;
}

const MIN_EXPIRES_IN = 1;
const MAX_EXPIRES_IN = 604_800; // 7 days, the AWS-spec ceiling.

// Tight default — same-page XHR PUTs land in seconds; a longer window is a
// replay surface (logs, browser history). Callers extend via `expiresIn` when
// they actually need it (e.g. resumable uploads).
export const DEFAULT_PRESIGN_TTL_SECONDS = 60;

export interface PresignedPut {
  readonly url: string;
  readonly method: "PUT";
  /** Headers the browser must send verbatim — they were signed. */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: number;
}

/** Mint a presigned PUT URL for an S3-compatible endpoint (R2 / AWS S3). */
export async function presignPutUrl(
  input: PresignPutInput,
): Promise<PresignedPut> {
  if (
    !Number.isFinite(input.expiresIn) ||
    input.expiresIn < MIN_EXPIRES_IN ||
    input.expiresIn > MAX_EXPIRES_IN
  ) {
    throw SigV4Error.expiresInOutOfRange({ expiresIn: input.expiresIn });
  }

  const scope = scopeOf(input.credentials, input.now);
  const endpoint = new URL(input.endpoint);
  const host = endpoint.host;
  const base = endpoint.pathname.replace(/\/$/, "");
  const path = `${base}/${rfc3986Encode(input.bucket)}/${encodePath(input.key)}`;

  // Sign content-type;host — matches the AWS SDK PutObjectCommand
  // default and the Cloudflare R2 presigned-URL docs.
  const headers: Record<string, string> = {
    "content-type": input.contentType,
    host,
  };
  const signedHeaders = "content-type;host";

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": scope.credential,
    "X-Amz-Date": scope.amzDate,
    "X-Amz-Expires": String(input.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  if (input.credentials.sessionToken !== undefined) {
    queryParams["X-Amz-Security-Token"] = input.credentials.sessionToken;
  }

  const canonicalQuery = canonicalQueryString(queryParams);
  const canonicalRequest = [
    "PUT",
    path,
    canonicalQuery,
    canonicalHeaderBlock(headers),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const signature = await sign(scope, input.credentials, canonicalRequest);
  const url = `${endpoint.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;

  return {
    url,
    method: "PUT",
    headers: { "content-type": input.contentType },
    expiresAt: Math.floor(scope.now.getTime() / 1000) + input.expiresIn,
  };
}

/** SHA-256 of an empty body — the payload hash of every bodiless request. */
export const EMPTY_PAYLOAD_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface SignRequestInput {
  readonly method: string;
  /**
   * Absolute URL, percent-encoded as it will be sent. Path and query are
   * canonicalised from it the way S3 does on receipt: decoded, then encoded
   * once per segment and pair.
   */
  readonly url: string;
  /**
   * Headers to send and sign. `host` is derived from the URL and must not be
   * given; the date, payload hash and session token are added here.
   */
  readonly headers?: Readonly<Record<string, string>>;
  /** Hex SHA-256 of the body, or `"UNSIGNED-PAYLOAD"`. */
  readonly payloadHash: string;
  readonly credentials: SigV4Credentials;
  /** Override "now" — used by tests for deterministic signatures. */
  readonly now?: Date;
}

/**
 * Sign a request with an `Authorization` header. Returns every header to
 * send, `host` excluded: `fetch` sets that one itself and refuses it as input.
 */
export async function signRequest(
  input: SignRequestInput,
): Promise<Record<string, string>> {
  const scope = scopeOf(input.credentials, input.now);
  const url = new URL(input.url);

  const toSend: Record<string, string> = {
    ...lowercaseKeys(input.headers ?? {}),
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": scope.amzDate,
  };
  if (input.credentials.sessionToken !== undefined) {
    toSend["x-amz-security-token"] = input.credentials.sessionToken;
  }

  const signed: Record<string, string> = { ...toSend, host: url.host };
  const signedHeaders = Object.keys(signed).sort().join(";");
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalPath(url.pathname),
    canonicalQueryString(parseQuery(url.search)),
    canonicalHeaderBlock(signed),
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const signature = await sign(scope, input.credentials, canonicalRequest);
  toSend.authorization =
    `AWS4-HMAC-SHA256 Credential=${scope.credential}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return toSend;
}

export async function sha256Hex(data: string | BufferSource): Promise<string> {
  const bytes = typeof data === "string" ? encodeUtf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

interface Scope {
  readonly now: Date;
  readonly amzDate: string;
  readonly dateStamp: string;
  readonly region: string;
  readonly service: string;
  readonly credentialScope: string;
  readonly credential: string;
}

function scopeOf(credentials: SigV4Credentials, now = new Date()): Scope {
  const { region } = credentials;
  const service = "s3";
  const amzDate = formatAmzDate(now); // 20260426T112233Z
  const dateStamp = amzDate.slice(0, 8); // 20260426
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  return {
    now,
    amzDate,
    dateStamp,
    region,
    service,
    credentialScope,
    credential: `${credentials.accessKeyId}/${credentialScope}`,
  };
}

async function sign(
  scope: Scope,
  credentials: SigV4Credentials,
  canonicalRequest: string,
): Promise<string> {
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    scope.amzDate,
    scope.credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  let key = encodeUtf8(`AWS4${credentials.secretAccessKey}`);
  for (const part of [
    scope.dateStamp,
    scope.region,
    scope.service,
    "aws4_request",
  ]) {
    key = await hmac(key, part);
  }
  return bytesToHex(new Uint8Array(await hmac(key, stringToSign)));
}

// The query as sent, split back into pairs so the canonical form can re-encode
// each one the AWS way regardless of how the caller encoded it.
function parseQuery(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (search.length <= 1) return params;
  for (const pair of search.slice(1).split("&")) {
    const at = pair.indexOf("=");
    const key = at === -1 ? pair : pair.slice(0, at);
    const value = at === -1 ? "" : pair.slice(at + 1);
    params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return params;
}

export function canonicalQueryString(
  params: Readonly<Record<string, string>>,
): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${rfc3986Encode(key)}=${rfc3986Encode(params[key] ?? "")}`)
    .join("&");
}

// Values are trimmed and inner whitespace runs collapsed — the canonical form
// only; the header goes on the wire as given.
function canonicalHeaderBlock(
  headers: Readonly<Record<string, string>>,
): string {
  return (
    Object.keys(headers)
      .sort()
      .map(
        (name) =>
          `${name}:${(headers[name] ?? "").trim().replace(/\s+/g, " ")}`,
      )
      .join("\n") + "\n"
  );
}

// S3 encodes each path segment exactly once, whatever the request encoded:
// `/test$file` and `/test%24file` both canonicalise to the latter.
function canonicalPath(pathname: string): string {
  return pathname
    .split("/")
    .map((s) => rfc3986Encode(decodeURIComponent(s)))
    .join("/");
}

function lowercaseKeys(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name.toLowerCase()] = value;
  }
  return out;
}

async function hmac(
  keyBytes: BufferSource,
  data: string,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encodeUtf8(data));
}

const TEXT_ENCODER = new TextEncoder();

// Copied into a fresh ArrayBuffer: `TextEncoder.encode()` returns
// `Uint8Array<ArrayBufferLike>`, which Web Crypto's `BufferSource` rejects.
function encodeUtf8(data: string): ArrayBuffer {
  const view = TEXT_ENCODER.encode(data);
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// AWS UTC stamp `YYYYMMDDTHHMMSSZ`: ISO 8601 with separators and millis dropped.
function formatAmzDate(d: Date): string {
  return d.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

// AWS canonical encoding: `encodeURIComponent` plus the four RFC 3986 reserved
// characters it leaves alone.
export function rfc3986Encode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// Object keys keep `/` as a literal separator (it survives in S3 paths). A
// `.` or `..` segment is refused: `new URL` and every fetch resolve it away,
// so the request would go to a path other than the one the key names.
export function encodePath(key: string): string {
  const segments = key.split("/");
  if (segments.some((s) => s === "." || s === "..")) {
    throw SigV4Error.keyNotAddressable({ key });
  }
  return segments.map(rfc3986Encode).join("/");
}
