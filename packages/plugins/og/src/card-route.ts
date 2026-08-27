import type { EntryData, ResolvedNode } from "plumix";
import type { AppContext } from "plumix/plugin";
import {
  buildResolvedEntries,
  serveRenderedAsset,
  tagCacheEntry,
  withBasePath,
} from "plumix";
import { and, eq } from "plumix/db";
import { entries, settings } from "plumix/schema";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardRenderer } from "./renderer.js";
import { resolveCardIdentity } from "./card-identity.js";
import { entryCardNode } from "./card-registry.js";
import { renderCardBytes, SANDBOX_CSP } from "./card-render.js";
import { extensionFor } from "./renderer.js";
import { isShareableEntry } from "./shareable.js";

/** Where the plugin mounts the route, relative to its own prefix. */
export const CARD_ROUTE_PATH = "/entry/*";

// Where core mounts this plugin's routes — it prefixes each with
// `/_plumix/<pluginId>` — spelled once because the head has to name the URL the
// route answers on, and a preview link has to reach the preview route.
export const OG_ROUTE_PREFIX = "/_plumix/og";
const CARD_URL_PREFIX = `${OG_ROUTE_PREFIX}/entry`;

/**
 * One card's URL. Absolute, because a scraper reads it out of the page and
 * never resolves it against anything; content-addressed, because that is the
 * only lever on the image caches X, Facebook and LinkedIn keep — a purge
 * reaches Cloudflare and stops there, while a changed URL is one they have to
 * fetch again.
 */
export function cardUrl(
  ctx: AppContext,
  id: number,
  digest: string,
  extension: string,
): string {
  const path = `${OG_ROUTE_PREFIX}/${entryCardPath(id, digest, extension)}`;
  return `${ctx.origin}${withBasePath(path, ctx.basePath)}`;
}

// Names one card within the site, and is the last segments of both the URL and
// the storage key — which is what "the URL is the key" means here, structurally
// rather than as a claim two string literals have to keep agreeing on.
function entryCardPath(id: number, digest: string, extension: string): string {
  return `entry/${String(id)}/${digest}.${extension}`;
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
 * `GET /_plumix/og/entry/<id>/<digest>.<ext>` — one published entry's card,
 * rendered on a miss and read back from storage on every request after.
 *
 * `/_plumix/og/entry/<id>.<ext>` is the same card without its digest: it names
 * whichever render is current and redirects there, which is what makes a card
 * reachable by hand while an unfurl still gets an immutable URL.
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
    const target = parseCardPath(url.pathname, extension);
    if (target === null) return notFound();
    // The whole URL is the edge cache's key, query string included, so a
    // parameter a caller invents is another entry holding the same immutable
    // bytes — an unauthenticated way to mint them without bound. A card reads
    // nothing from the query, so there is nothing to keep: send it back to the
    // one URL that addresses these bytes, before any of the work below.
    if (url.search !== "") return redirect(`${ctx.origin}${url.pathname}`);

    const resolved = await resolveEntryNode(ctx, target.id);
    if (resolved === null) return notFound();

    const rule = cards.resolve(resolved.node, resolved.data);
    if (rule === undefined) return notFound();
    const { card } = rule;

    const rendered = inputs();
    const identity = await resolveCardIdentity(
      card,
      resolved.data,
      ctx,
      rendered,
      extension,
    );
    const { args } = identity;

    // The digest in the URL is never taken as the key: a crafted one would
    // otherwise mint an entry per request, in storage and at the edge alike.
    // A URL naming any other render — the digest-less one, or one an edit has
    // superseded — is answered by naming the current one instead.
    if (target.digest !== identity.digest) {
      return redirect(cardUrl(ctx, target.id, identity.digest, extension));
    }
    // What a purge of this card names, which for an entry card is the entry
    // tag the publish hook already sweeps. Belt and braces: the URL moved with
    // the edit, so nothing that reads the old one is stale.
    tagCacheEntry(ctx, [identity.key.tag]);

    let response: Response;
    try {
      response = await serveRenderedAsset({
        request,
        key: `og/${entryCardPath(target.id, identity.digest, extension)}`,
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
  const fallback = await siteSetting(ctx, "default_og_image");
  const location = fallback === undefined ? null : absolute(ctx, fallback);
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

// The setting holds whatever an operator typed: a full URL, or a path into the
// site's own media. A `Location` has to be neither ambiguous nor malformed.
function absolute(ctx: AppContext, value: string): string | null {
  return URL.parse(value, ctx.origin)?.href ?? null;
}

async function siteSetting(
  ctx: AppContext,
  key: string,
): Promise<string | undefined> {
  const [row] = await ctx.db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.group, "site"), eq(settings.key, key)))
    .limit(1);
  return typeof row?.value === "string" && row.value.length > 0
    ? row.value
    : undefined;
}

interface EntryNode {
  readonly node: ResolvedNode;
  readonly data: EntryData;
}

/**
 * The published entry behind a card URL, in the shape card rules resolve
 * against: the node a matcher matches on, and the same `data` the entry's own
 * template would receive.
 */
async function resolveEntryNode(
  ctx: AppContext,
  id: number,
): Promise<EntryNode | null> {
  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);
  if (!row || !(await isShareableEntry(ctx, row))) return null;

  const [entry] = await buildResolvedEntries(ctx, [row]);
  if (entry === undefined) return null;
  return { node: entryCardNode(row), data: { kind: "entry", entry } };
}

interface CardPath {
  readonly id: number;
  /** The render the URL named, or null for the digest-less pointer. */
  readonly digest: string | null;
}

// `<id>.<ext>` or `<id>/<digest>.<ext>`. 15 digits max keeps the parsed id
// below Number.MAX_SAFE_INTEGER. The two forms are told apart by shape rather
// than by what the leading segment looks like: a digest is hex, so one that
// happens to be all digits would otherwise read as an id.
const CARD_PATH = /^([1-9]\d{0,14})(?:\/([0-9a-f]+))?\.([a-z]+)$/;

/**
 * What the URL is asking for, or null when it asks for nothing this route
 * serves. Read against the route's own mount rather than off the end of the
 * path, so a `/entry` segment anywhere else in the URL is off the table before
 * anything is parsed. The base path is not in it: what reaches a route handler
 * has already had the site's mount stripped.
 */
function parseCardPath(pathname: string, extension: string): CardPath | null {
  const prefix = `${CARD_URL_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;

  const [, digits, digest, named] =
    CARD_PATH.exec(pathname.slice(prefix.length)) ?? [];
  if (digits === undefined || named !== extension) return null;
  return { id: Number.parseInt(digits, 10), digest: digest ?? null };
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}
