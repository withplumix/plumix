import * as v from "valibot";

import type { PlumixFetch } from "../../context/app-context.js";

/** An MCP client as its Client ID Metadata Document describes it. */
export interface OAuthClient {
  /** The document's URL, which is also its `client_id`. */
  readonly clientId: string;
  readonly name: string;
  readonly host: string;
  readonly logoUri: string | undefined;
  readonly redirectUris: readonly string[];
  /** Every redirect goes to the person's own machine. */
  readonly loopbackOnly: boolean;
}

export type ClientMetadataRefusal =
  | "insecure_url"
  | "too_large"
  | "timeout"
  | "unreachable"
  | "insecure_redirect"
  | "too_many_redirects"
  | "invalid_document"
  | "client_id_mismatch";

/** Why a client's metadata document was refused; `reason` is the message. */
export class ClientMetadataError extends Error {
  static {
    ClientMetadataError.prototype.name = "ClientMetadataError";
  }

  readonly reason: ClientMetadataRefusal;

  constructor(reason: ClientMetadataRefusal) {
    super(reason);
    this.reason = reason;
  }
}

/** The cap the CIMD draft suggests; a client's document is a few hundred bytes. */
const MAX_DOCUMENT_BYTES = 5 * 1024;

/** How long an accepted document is reused before it's fetched again. */
const CACHE_TTL_MS = 5 * 60_000;

/** Hops followed before the fetch gives up; every hop must stay on HTTPS. */
const MAX_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Covers the fetch and reading its body. */
const FETCH_TIMEOUT_MS = 5_000;

const DECODER = new TextDecoder();

/** Reads at most `MAX_DOCUMENT_BYTES`, so a huge body is never buffered whole. */
async function readCappedText(response: Response): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_DOCUMENT_BYTES) {
        throw new ClientMetadataError("too_large");
      }
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return DECODER.decode(bytes);
}

async function fetchDocument(
  fetch: PlumixFetch,
  clientId: string,
): Promise<string> {
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    let url = clientId;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetch(url, {
        redirect: "manual",
        signal: deadline.signal,
      });
      const location = REDIRECT_STATUSES.has(response.status)
        ? response.headers.get("location")
        : null;
      if (location === null) {
        if (!response.ok) throw new ClientMetadataError("invalid_document");
        return await readCappedText(response);
      }
      const next = URL.parse(location, url);
      if (next?.protocol !== "https:") {
        throw new ClientMetadataError("insecure_redirect");
      }
      url = next.href;
    }
    throw new ClientMetadataError("too_many_redirects");
  } catch (error) {
    if (deadline.signal.aborted) throw new ClientMetadataError("timeout");
    if (error instanceof ClientMetadataError) throw error;
    throw new ClientMetadataError("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

const documentSchema = v.object({
  client_id: v.string(),
  client_name: v.optional(v.string()),
  logo_uri: v.optional(v.string()),
  redirect_uris: v.pipe(v.array(v.string()), v.minLength(1)),
});

function parseDocument(text: string): v.InferOutput<typeof documentSchema> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ClientMetadataError("invalid_document");
  }
  const parsed = v.safeParse(documentSchema, json);
  if (!parsed.success) throw new ClientMetadataError("invalid_document");
  return parsed.output;
}

export function createClientMetadataResolver(deps: {
  readonly fetch: PlumixFetch;
}): { resolve(clientId: string): Promise<OAuthClient> } {
  const cache = new Map<string, { client: OAuthClient; expiresAt: number }>();
  return {
    async resolve(clientId) {
      const cached = cache.get(clientId);
      if (cached && cached.expiresAt > Date.now()) return cached.client;
      if (URL.parse(clientId)?.protocol !== "https:") {
        throw new ClientMetadataError("insecure_url");
      }
      const document = parseDocument(await fetchDocument(deps.fetch, clientId));
      if (document.client_id !== clientId) {
        throw new ClientMetadataError("client_id_mismatch");
      }
      const host = new URL(clientId).host;
      const client: OAuthClient = {
        clientId,
        name: document.client_name ?? host,
        host,
        logoUri: document.logo_uri,
        redirectUris: document.redirect_uris,
        loopbackOnly: document.redirect_uris.every(
          (uri) => loopbackForm(uri) !== undefined,
        ),
      };
      cache.set(clientId, { client, expiresAt: Date.now() + CACHE_TTL_MS });
      return client;
    },
  };
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * A loopback URI with its host name and port erased, so `localhost` and
 * `127.0.0.1` on any port compare equal (RFC 8252 §7.3); `undefined` for any
 * other URI.
 */
function loopbackForm(uri: string): string | undefined {
  const url = URL.parse(uri);
  if (url === null || !LOOPBACK_HOSTNAMES.has(url.hostname)) return undefined;
  url.hostname = "loopback";
  url.port = "";
  return url.href;
}

/**
 * Whether `client` may receive an authorization code at `redirectUri`: one its
 * document lists exactly, or a loopback one on either host name and any port.
 */
export function acceptsRedirectUri(
  client: OAuthClient,
  redirectUri: string,
): boolean {
  if (client.redirectUris.includes(redirectUri)) return true;
  const loopback = loopbackForm(redirectUri);
  return (
    loopback !== undefined &&
    client.redirectUris.some((listed) => loopbackForm(listed) === loopback)
  );
}
