import type { TemplateData } from "plumix";
import type { AppContext, ResolvedNode } from "plumix/plugin";
import { eq } from "plumix/db";
import {
  resolveEntryData,
  resolveListingPage,
  serveRenderedAsset,
  tagCdnEntry,
} from "plumix/plugin";
import { entries } from "plumix/schema";
import { withBasePath } from "plumix/support";

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

/** One mount for every page kind; the kind is a path segment, not a route. */
export const CARD_ROUTE_PATH = "/card/*";

// Core prefixes plugin routes with `/_plumix/<pluginId>`; the head needs the
// full URL.
export const OG_ROUTE_PREFIX = "/_plumix/og";
const CARD_URL_PREFIX = `${OG_ROUTE_PREFIX}/card`;

/**
 * Absolute, since scrapers never resolve it. Content-addressed, since a changed
 * URL is the only way to refresh the image caches X, Facebook and LinkedIn
 * keep.
 */
export function cardUrl(
  ctx: AppContext,
  target: CardTarget,
  digest: string,
  extension: string,
): string {
  const path = `${CARD_URL_PREFIX}/${cardAssetPath(target, digest, extension)}`;
  return `${ctx.origin}${withBasePath(path, ctx.config.basePath)}`;
}

// The last segments of both the URL and the storage key, so the two can't
// drift.
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
   * Read per request: the theme hands its tokens over after the route is built.
   * Must be the accessor the head uses, so both name one digest.
   */
  readonly inputs: () => CardInputs;
}

/**
 * Serves `<target>/<digest>.<ext>`, rendering on a miss. The digest-less
 * `<target>.<ext>` redirects to the current render.
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
    // The query string is part of the CDN key, so an invented parameter would
    // mint unbounded entries for the same bytes.
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

    // Never trust the URL's digest as the key: a crafted one would mint an
    // entry per request.
    if (asked.digest !== identity.digest) {
      return redirect(cardUrl(ctx, asked.target, identity.digest, extension));
    }
    tagCdnEntry(ctx, [identity.key.tag]);

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

// The head already shipped this URL, so an error status would break a promised
// image. Never cached: the next render may work.
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

async function resolveCardPage(
  ctx: AppContext,
  target: CardTarget,
): Promise<CardPage | null> {
  const data = await cardTargetData(ctx, target);
  if (data === null || !(await isShareablePage(ctx, data))) return null;

  const identity = cardIdentityFor(data);
  return identity === null ? null : { node: identity.node, data };
}

/**
 * Always the public page's data, whoever asks; a digest over anything else
 * names a card the route never serves.
 */
export async function cardTargetData(
  ctx: AppContext,
  target: CardTarget,
): Promise<TemplateData | null> {
  return target.kind === "entry"
    ? entryData(ctx, target.id)
    : ((await resolveListingPage(ctx, target))?.data ?? null);
}

// The live row, never an autosave: the card is public and edge cached, so a
// draft an author is previewing has no place on it.
async function entryData(
  ctx: AppContext,
  id: number,
): Promise<TemplateData | null> {
  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);
  return row ? resolveEntryData(ctx, row) : null;
}

interface AskedCard {
  readonly target: CardTarget;
  readonly digest: string | null;
}

// A bare id is also hex, so the longer form is tried first.
const DIGEST = /^[0-9a-f]+$/;

// The site's base path is already stripped from what reaches a route handler.
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
