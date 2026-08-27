import type { ResolvedNode, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import {
  buildResolvedEntries,
  resolveListingPage,
  serveRenderedAsset,
  tagCacheEntry,
  withBasePath,
} from "plumix";
import { eq } from "plumix/db";
import { entries } from "plumix/schema";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardTarget } from "./card-target.js";
import type { CardRenderer } from "./renderer.js";
import { resolveCardIdentity } from "./card-identity.js";
import { renderCardBytes, SANDBOX_CSP } from "./card-render.js";
import {
  cardIdentityFor,
  cardTargetPath,
  parseCardTargetPath,
} from "./card-target.js";
import { extensionFor } from "./renderer.js";
import { isShareablePage } from "./shareable.js";
import { siteDefaultImage } from "./site.js";

/**
 * Where the plugin mounts the route, relative to its own prefix. One mount for
 * every page kind a card is served for — the kind is a path segment the handler
 * reads, not a route of its own, so adding a kind adds no route and the mount
 * is spelled here and nowhere else.
 */
export const CARD_ROUTE_PATH = "/card/*";

// Where core mounts this plugin's routes — it prefixes each with
// `/_plumix/<pluginId>` — spelled once because the head has to name the URL the
// route answers on, and a preview link has to reach the preview route.
export const OG_ROUTE_PREFIX = "/_plumix/og";
const CARD_URL_PREFIX = `${OG_ROUTE_PREFIX}/card`;

/**
 * One card's URL. Absolute, because a scraper reads it out of the page and
 * never resolves it against anything; content-addressed, because that is the
 * only lever on the image caches X, Facebook and LinkedIn keep — a purge
 * reaches Cloudflare and stops there, while a changed URL is one they have to
 * fetch again.
 */
export function cardUrl(
  ctx: AppContext,
  target: CardTarget,
  digest: string,
  extension: string,
): string {
  const path = `${CARD_URL_PREFIX}/${cardAssetPath(target, digest, extension)}`;
  return `${ctx.origin}${withBasePath(path, ctx.basePath)}`;
}

// Names one card within the site, and is the last segments of both the URL and
// the storage key — which is what "the URL is the key" means here, structurally
// rather than as a claim two string literals have to keep agreeing on.
function cardAssetPath(
  target: CardTarget,
  digest: string,
  extension: string,
): string {
  return `${cardTargetPath(target)}/${digest}.${extension}`;
}

export interface CardRouteOptions {
  readonly renderer: CardRenderer;
  /** What the theme declared, behind the plugin's own default. */
  readonly cards: CardRegistry;
  /**
   * Everything a card is addressed and rendered by that isn't the card. Read
   * per request rather than captured, because the theme hands its tokens over
   * after the route is built — and read through the same accessor the head
   * uses, since the two have to name one digest.
   */
  readonly inputs: () => CardInputs;
}

/**
 * `GET /_plumix/og/card/<target>/<digest>.<ext>` — one page's card, rendered on
 * a miss and read back from storage on every request after. `<target>` names
 * the page: `entry/12`, `term/3`, `archive/post`, `date/2026-03`, `front-page`.
 *
 * `/_plumix/og/card/<target>.<ext>` is the same card without its digest: it
 * names whichever render is current and redirects there, which is what makes a
 * card reachable by hand while an unfurl still gets an immutable URL.
 */
export function createCardRoute(
  options: CardRouteOptions,
): (request: Request, ctx: AppContext) => Promise<Response> {
  const { renderer, cards, inputs } = options;
  // A format with no extension has no URL to serve a card at, so the route is
  // decided here rather than re-asked on every request.
  const extension = extensionFor(renderer.contentType);
  if (extension === undefined) return () => Promise.resolve(notFound());

  return async (request, ctx) => {
    const url = new URL(request.url);
    const asked = parseCardPath(url.pathname, extension);
    if (asked === null) return notFound();
    // The whole URL is the edge cache's key, query string included, so a
    // parameter a caller invents is another entry holding the same immutable
    // bytes — an unauthenticated way to mint them without bound. A card reads
    // nothing from the query, so there is nothing to keep: send it back to the
    // one URL that addresses these bytes, before any of the work below.
    if (url.search !== "") return redirect(`${ctx.origin}${url.pathname}`);

    const page = await resolveCardPage(ctx, asked.target);
    if (page === null) return notFound();

    const rule = cards.resolve(page.node, page.data);
    if (rule === undefined) return notFound();
    const { card } = rule;

    const rendered = inputs();
    const identity = await resolveCardIdentity(
      card,
      page.data,
      ctx,
      rendered,
      extension,
    );
    const { args } = identity;

    // The digest in the URL is never taken as the key: a crafted one would
    // otherwise mint an entry per request, in storage and at the edge alike.
    // A URL naming any other render — the digest-less one, or one an edit has
    // superseded — is answered by naming the current one instead.
    if (asked.digest !== identity.digest) {
      return redirect(cardUrl(ctx, asked.target, identity.digest, extension));
    }
    // What a purge of this card names, which for an entry card is the entry
    // tag the publish hook already sweeps. Belt and braces: the URL moved with
    // the edit, so nothing that reads the old one is stale.
    tagCacheEntry(ctx, [identity.key.tag]);

    let response: Response;
    try {
      response = await serveRenderedAsset({
        request,
        key: `og/${cardAssetPath(asked.target, identity.digest, extension)}`,
        contentType: renderer.contentType,
        storage: ctx.storage,
        render: () =>
          renderCardBytes({ card, args, ctx, renderer, inputs: rendered }),
      });
    } catch (error) {
      ctx.logger.error("og_card_render_failed", {
        url: ctx.request.url,
        err: error instanceof Error ? error.message : String(error),
      });
      // In development the developer is the audience, not a scraper: let the
      // throw through so it reaches the dev error page with its stack intact.
      if (process.env.PLUMIX_DEV) throw error;
      return siteDefaultRedirect(ctx);
    }
    response.headers.set("content-security-policy", SANDBOX_CSP);
    return response;
  };
}

/**
 * What a card that could not be produced answers with. The page's head shipped
 * this URL before anything rendered and cannot take it back, so an error status
 * would leave a promised image broken; the site's own default is the closest
 * thing to what the page meant. Never cached — the next render may well work.
 */
async function siteDefaultRedirect(ctx: AppContext): Promise<Response> {
  const location = await siteDefaultImage(ctx);
  return location === null ? notFound() : redirect(location);
}

// Never stored: it points at whatever is current, and the whole point of the
// card URL beside it is that *that* one is the immutable thing.
function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location, "cache-control": "no-store" },
  });
}

interface CardPage {
  readonly node: ResolvedNode;
  readonly data: TemplateData;
}

/**
 * The page behind a card URL, in the shape card rules resolve against: the node
 * a matcher matches on, and the same `data` the page's own template would
 * receive. Null where no such page is publicly shareable, which is the route's
 * whole answer to a draft, a private type, an empty term or an invented date.
 */
async function resolveCardPage(
  ctx: AppContext,
  target: CardTarget,
): Promise<CardPage | null> {
  // Every kind but an entry resolves through core, which is what keeps a card
  // rendered from the page's own data rather than from a second, drifting copy
  // of the queries behind it — pagination included, which core pins to page one.
  const data =
    target.kind === "entry"
      ? await entryData(ctx, target.id)
      : ((await resolveListingPage(ctx, target))?.data ?? null);
  if (data === null || !(await isShareablePage(ctx, data))) return null;

  const identity = cardIdentityFor(data);
  return identity === null ? null : { node: identity.node, data };
}

async function entryData(
  ctx: AppContext,
  id: number,
): Promise<TemplateData | null> {
  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);
  if (!row) return null;

  const [entry] = await buildResolvedEntries(ctx, [row]);
  return entry === undefined ? null : { kind: "entry", entry };
}

interface AskedCard {
  readonly target: CardTarget;
  /** The render the URL named, or null for the digest-less pointer. */
  readonly digest: string | null;
}

// A digest is lowercase hex, and so is a bare id, so the two forms are told
// apart by trying the longer one first: `entry/12` reads as a target with a
// digest until `entry` fails to parse as a whole target.
const DIGEST = /^[0-9a-f]+$/;

/**
 * What the URL is asking for, or null when it asks for nothing this route
 * serves. Read against the route's own mount rather than off the end of the
 * path, so a `/card` segment anywhere else in the URL is off the table before
 * anything is parsed. The base path is not in it: what reaches a route handler
 * has already had the site's mount stripped.
 */
function parseCardPath(pathname: string, extension: string): AskedCard | null {
  const prefix = `${CARD_URL_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);

  const suffix = `.${extension}`;
  if (!rest.endsWith(suffix)) return null;
  const named = rest.slice(0, -suffix.length);

  const parts = named.split("/");
  const last = parts.at(-1) ?? "";
  if (parts.length > 1 && DIGEST.test(last)) {
    const target = parseCardTargetPath(parts.slice(0, -1).join("/"));
    if (target !== null) return { target, digest: last };
  }
  const target = parseCardTargetPath(named);
  return target === null ? null : { target, digest: null };
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}
