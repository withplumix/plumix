import { withBasePath } from "./base-path.js";

export interface ResolveReturnUrlOptions {
  /**
   * Tried before `Referer`: after a rejected submit the document is the
   * endpoint, and a POST-only route answers a GET with 404.
   */
  readonly returnTo: string | null | undefined;
  /** The endpoint's own path, which no answer may point back at. */
  readonly endpoint: string;
}

/**
 * Falls back to the site root. Candidates must be on an origin this site
 * answers on and not the endpoint itself, so neither an open redirect nor a
 * loop.
 */
export function resolveReturnUrl(
  request: Request,
  ctx: {
    readonly origin: string;
    readonly config: { readonly basePath: string };
  },
  { returnTo, endpoint }: ResolveReturnUrlOptions,
): string {
  const here = new URL(request.url);
  const configured = URL.parse(ctx.origin)?.origin;
  const endpointPath = withBasePath(endpoint, ctx.config.basePath);
  for (const candidate of [returnTo, request.headers.get("referer")]) {
    const url = URL.parse(candidate ?? "", here);
    if (url === null || url.pathname === endpointPath) continue;
    // Protocol as well as origin: `URL.origin` for a `blob:` URL is the inner
    // origin, so `blob:https://site.example/…` would otherwise pass the gate
    // and be handed straight back as a `Location`.
    if (url.protocol !== here.protocol) continue;
    if (url.origin === here.origin || url.origin === configured)
      return url.href;
  }
  return withBasePath("/", ctx.config.basePath);
}
