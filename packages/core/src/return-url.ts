import { withBasePath } from "./base-path.js";

export interface ResolveReturnUrlOptions {
  /**
   * The hidden field the re-rendered form carries. Tried before the browser's
   * own `Referer`: after a rejected submit the document *is* the endpoint, so
   * the `Referer` would send the retry back there and a POST-only route
   * answers a GET with 404.
   */
  readonly returnTo: string | null | undefined;
  /** The endpoint's own path, which no answer may point back at. */
  readonly endpoint: string;
}

/**
 * Where to send a visitor after a form post that the browser, not an island,
 * submitted — the page the form was on, or the site root when nothing offered
 * a usable answer.
 *
 * Both candidates are the visitor's to set, so each is held to an origin this
 * site answers on and refused the endpoint's own path: the response can be
 * turned into neither an open redirect nor a loop.
 *
 * Candidates resolve against the request's own URL, so a relative value — the
 * natural thing for a template to pass — is read as a path on this site
 * rather than one `URL.parse` refuses outright. Both the request's origin and
 * the configured one are accepted, which is the pair the dispatcher's own
 * Origin check accepts: on a multi-host deploy, holding to the configured
 * origin alone would reject every candidate and send every visitor to the
 * site root.
 */
export function resolveReturnUrl(
  request: Request,
  ctx: { readonly origin: string; readonly basePath: string },
  { returnTo, endpoint }: ResolveReturnUrlOptions,
): string {
  const here = new URL(request.url);
  const configured = URL.parse(ctx.origin)?.origin;
  const endpointPath = withBasePath(endpoint, ctx.basePath);
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
  return withBasePath("/", ctx.basePath);
}
