// AWS SigV4 query-string signing for presigned PUT URLs against the R2
// S3-compatible API. Hand-rolled with Web Crypto so we don't pull the
// AWS SDK (~40 KB gz) into a worker bundle just to mint a URL.
//
// Reference:
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html

interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Defaults to "auto" (R2's required value) when caller omits. */
  readonly region?: string;
  /** Defaults to "s3". */
  readonly service?: string;
}

interface PresignPutInput {
  /** Full bucket origin, e.g. `https://<account>.r2.cloudflarestorage.com`. */
  readonly endpoint: string;
  /** Bucket name — appended to the path between origin and key. */
  readonly bucket: string;
  /** Object key (already URL-safe; we re-encode segment-by-segment). */
  readonly key: string;
  /** Mime echoed back to the browser so R2 stores correct metadata. NOT signed (see comment in `presignPutUrl`). */
  readonly contentType: string;
  /** Required: signed into the canonical request so the browser can't upload more bytes than the draft allows. */
  readonly contentLength: number;
  /** Seconds until the URL expires. Clamped to AWS's 1..604800 range. */
  readonly expiresIn: number;
  readonly credentials: SigV4Credentials;
  /** Override "now" — used by tests for deterministic signatures. */
  readonly now?: Date;
}

const MIN_EXPIRES_IN = 1;
const MAX_EXPIRES_IN = 604_800; // 7 days, the AWS-spec ceiling.

interface PresignedPut {
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
    throw new Error(
      `presignPutUrl: expiresIn must be in [${String(MIN_EXPIRES_IN)}..${String(MAX_EXPIRES_IN)}] seconds, got ${String(input.expiresIn)}`,
    );
  }

  const region = input.credentials.region ?? "auto";
  const service = input.credentials.service ?? "s3";
  const now = input.now ?? new Date();
  const amzDate = formatAmzDate(now); // 20260426T112233Z
  const dateStamp = amzDate.slice(0, 8); // 20260426
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${input.credentials.accessKeyId}/${credentialScope}`;

  const host = new URL(input.endpoint).host;
  const path = `/${rfc3986Encode(input.bucket)}/${encodePath(input.key)}`;

  // Sign `host` and `content-length`, NOT `content-type`. Browsers
  // append `; charset=…` to text mimes after the signature is made,
  // producing opaque `SignatureDoesNotMatch` from R2. Content-Length
  // is safe — XHR/fetch send what we set verbatim — and signing it
  // closes a replay attack: a leaked URL otherwise lets the holder
  // upload arbitrary-size content during the expires window.
  const headers: Record<string, string> = {
    host,
    "content-length": String(input.contentLength),
  };
  const signedHeaders = "content-length;host";
  // Browser must echo content-length (XHR does this automatically)
  // and content-type (we send it explicitly so R2 stores the right
  // mime metadata). Content-type is outside the signature; mime
  // correctness is verified by `media.confirm`'s magic-byte sniff.
  const browserHeaders: Record<string, string> = {
    "content-type": input.contentType,
  };

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalQuery = canonicalQueryString(queryParams);
  const canonicalHeaders = canonicalHeaderBlock(headers);

  const canonicalRequest = [
    "PUT",
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    input.credentials.secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signatureBytes = await hmac(signingKey, stringToSign);
  const signature = bytesToHex(new Uint8Array(signatureBytes));

  const url = `${input.endpoint.replace(/\/$/, "")}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;

  return {
    url,
    method: "PUT",
    headers: browserHeaders,
    expiresAt: Math.floor(now.getTime() / 1000) + input.expiresIn,
  };
}

function canonicalQueryString(
  params: Readonly<Record<string, string>>,
): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${rfc3986Encode(key)}=${rfc3986Encode(params[key] ?? "")}`)
    .join("&");
}

function canonicalHeaderBlock(
  headers: Readonly<Record<string, string>>,
): string {
  return (
    Object.keys(headers)
      .sort()
      .map((name) => `${name.toLowerCase()}:${(headers[name] ?? "").trim()}`)
      .join("\n") + "\n"
  );
}

async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<CryptoKey> {
  const kSecret = encodeUtf8(`AWS4${secretAccessKey}`);
  const kDate = await hmacRaw(kSecret, dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  const kSigning = await hmacRaw(kService, "aws4_request");
  return importHmacKey(kSigning);
}

async function hmacRaw(
  keyBytes: BufferSource,
  data: string,
): Promise<ArrayBuffer> {
  const key = await importHmacKey(keyBytes);
  return hmac(key, data);
}

async function importHmacKey(keyBytes: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmac(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, encodeUtf8(data));
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encodeUtf8(data));
  return bytesToHex(new Uint8Array(digest));
}

const TEXT_ENCODER = new TextEncoder();

// `TextEncoder().encode()` returns `Uint8Array<ArrayBufferLike>` which
// TS 6 strict-mode flags as not assignable to Web Crypto's `BufferSource`
// (the union excludes SharedArrayBuffer-backed views). Copy into a
// freshly-allocated ArrayBuffer once so the consumers' parameter types
// line up without per-call casts.
function encodeUtf8(data: string): ArrayBuffer {
  const view = TEXT_ENCODER.encode(data);
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  const out: string[] = [];
  for (const byte of bytes) {
    out.push(byte.toString(16).padStart(2, "0"));
  }
  return out.join("");
}

// AWS UTC stamp: `YYYYMMDDTHHMMSSZ` — basic ISO 8601 without separators.
function formatAmzDate(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// AWS canonical encoding — RFC 3986 unreserved set, '/' is reserved
// (encoded as %2F) inside query values, but we use this for query keys
// where '/' won't appear and for header values which trim only.
function rfc3986Encode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// Object keys keep `/` as a literal separator (it survives in S3 paths).
function encodePath(key: string): string {
  return key.split("/").map(rfc3986Encode).join("/");
}
