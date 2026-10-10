/** What a runtime knows about the connection a request arrived on. */
export interface Connection {
  /**
   * The scheme the listener accepted the connection with. The runtime names
   * it from its own configuration rather than sniffing the socket, which
   * reads differently from one runtime to the next.
   */
  readonly scheme: "http" | "https";
  /** The port the listener is bound to, named when the request has no Host. */
  readonly port: number;
  readonly remoteAddress?: string;
}

export interface RequestTrustOptions {
  /**
   * Reads `x-forwarded-proto`, `-host` and the rightmost `-for`. Off by
   * default, so a direct visitor can't forge them.
   */
  readonly trustProxy?: boolean;
}

export interface TrustedRequest {
  /** The URL the handler should see. */
  readonly url: URL;
  readonly clientAddress?: string;
}

/** An empty header reads as absent, so a blank `Host` still yields a URL. */
function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value === null || value === "" ? undefined : value;
}

/** Throws when the host is not one a URL can carry. */
export function trustRequest(
  request: Request,
  connection: Connection,
  options: RequestTrustOptions = {},
): TrustedRequest {
  const forwarded = (name: string): string | undefined =>
    options.trustProxy === true ? header(request, name) : undefined;
  const scheme = forwarded("x-forwarded-proto") ?? connection.scheme;
  const host =
    forwarded("x-forwarded-host") ??
    header(request, "host") ??
    `localhost:${connection.port}`;
  const source = new URL(request.url);
  // Assigned rather than resolved against the origin: a protocol-relative
  // path would otherwise replace the host the request was for.
  const url = new URL(`${scheme}://${host}`);
  url.pathname = source.pathname;
  url.search = source.search;
  const last = forwarded("x-forwarded-for")?.split(",").at(-1)?.trim();
  return {
    url,
    clientAddress:
      last === undefined || last === "" ? connection.remoteAddress : last,
  };
}
