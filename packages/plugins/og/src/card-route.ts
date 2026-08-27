import type { EntryData, ResolvedNode, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import {
  buildResolvedEntries,
  loadTemplateDeps,
  serveRenderedAsset,
  withBasePath,
} from "plumix";
import { and, eq } from "plumix/db";
import { entries, settings } from "plumix/schema";

import type { CardRegistry } from "./card-registry.js";
import type { CardArgs } from "./card.js";
import type { CardRenderer } from "./renderer.js";
import { cardStorageKey } from "./card-key.js";
import { entryCardNode } from "./card-registry.js";
import { cardSourceHash } from "./card-source.js";
import { OgPluginError } from "./errors.js";
import { CARD_HEIGHT, CARD_WIDTH, extensionFor } from "./renderer.js";
import { isShareableEntry } from "./shareable.js";

/** Where the plugin mounts the route, relative to its own prefix. */
export const CARD_ROUTE_PATH = "/entry/*";

// The same path once mounted: core prefixes a plugin route with
// `/_plumix/<pluginId>`, and the head has to name the URL the route answers on.
const CARD_URL_PREFIX = "/_plumix/og/entry";

/**
 * One entry's card URL. Absolute, because a scraper reads it out of the page
 * and never resolves it against anything.
 */
export function cardUrl(
  ctx: AppContext,
  id: number,
  extension: string,
): string {
  const path = `${CARD_URL_PREFIX}/${String(id)}.${extension}`;
  return `${ctx.origin}${withBasePath(path, ctx.basePath)}`;
}

// The URL names a card, not one immutable render — a retitled post keeps its
// card URL and changes what is behind it. Freshness therefore comes from the
// ETag round-trip, which the read-through derives from the content-addressed
// storage key, rather than from an age a scraper would sit on. Provisional:
// once the key reaches the URL the card becomes immutable and this goes.
const CACHE_CONTROL = "public, max-age=0, must-revalidate";

// A card is bytes a renderer produced, and the renderer is a slot: `remote()`
// and any third-party implementation can answer with whatever they like, served
// inline from the site's own origin. SVG is a document to a browser, so a
// direct navigation would run whatever script those bytes carried. The media
// plugin answers the same hazard by forcing a download; a card has to stay
// viewable, so it is defused here instead.
const SANDBOX_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export interface CardRouteOptions {
  readonly renderer: CardRenderer;
  /** Asset-layer paths, in fallback order. */
  readonly fonts: readonly string[];
  /** What the theme declared, behind the plugin's own default. */
  readonly cards: CardRegistry;
}

/**
 * `GET /_plumix/og/entry/<id>.<ext>` — the card for one published entry,
 * rendered on a miss and read back from storage on every request after.
 */
export function createCardRoute(
  options: CardRouteOptions,
): (request: Request, ctx: AppContext) => Promise<Response> {
  const { renderer, fonts, cards } = options;
  // A format with no extension has no URL to serve a card at, so the route is
  // decided here rather than re-asked on every request.
  const extension = extensionFor(renderer.contentType);
  if (extension === undefined) return () => Promise.resolve(notFound());

  return async (request, ctx) => {
    const { pathname } = new URL(request.url);
    const id = parseEntryId(
      pathname.slice(pathname.lastIndexOf("/") + 1),
      extension,
    );
    if (id === null) return notFound();

    const resolved = await resolveEntryNode(ctx, id);
    if (resolved === null) return notFound();

    const rule = cards.resolve(resolved.node, resolved.data);
    if (rule === undefined) return notFound();
    const { card } = rule;

    const args: CardArgs<TemplateData> = {
      // Spread first, so a dep kind named `data` or `ctx` cannot displace the
      // framework-owned pair — the same ordering the template renderer uses.
      ...(await loadTemplateDeps({ ...card }, ctx.plugins.templateDeps, ctx)),
      data: resolved.data,
      ctx,
    };
    // Read once: the size the key describes has to be the size that was
    // rendered, or the stored bytes are not what the key says they are.
    const width = card.width ?? CARD_WIDTH;
    const height = card.height ?? CARD_HEIGHT;

    let response: Response;
    try {
      response = await serveRenderedAsset({
        request,
        key: await cardStorageKey({
          target: `entry/${String(id)}`,
          hash: card.key(args).hash,
          sourceHash: await cardSourceHash(card),
          fonts,
          width,
          height,
          extension,
        }),
        contentType: renderer.contentType,
        cacheControl: CACHE_CONTROL,
        storage: ctx.storage,
        render: async () =>
          renderer.render(card.render(args), {
            width,
            height,
            stylesheets: card.styles ?? [],
            fonts: await loadFonts(ctx, fonts),
            fetch: ctx.fetch,
          }),
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
  if (location === null) return notFound();
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

/**
 * Fonts come from the platform asset layer rather than the Worker bundle, so
 * adding cards costs no deployment size. The engine reads TTF, OTF and WOFF —
 * not WOFF2, which is what most font packages ship.
 *
 * A declared font that cannot be read fails the render rather than dropping to
 * the engine's own fallback face, which would answer 200 with a card nobody
 * meant to publish. The failure then takes the route's fallback path.
 */
async function loadFonts(
  ctx: AppContext,
  paths: readonly string[],
): Promise<Uint8Array[]> {
  if (paths.length === 0) return [];
  const assets = ctx.assets;
  if (assets === undefined) throw OgPluginError.assetLayerMissing({ paths });

  return Promise.all(
    paths.map(async (path) => {
      const response = await assets.fetch(
        new Request(new URL(path, ctx.origin)),
      );
      if (!response.ok) {
        throw OgPluginError.fontAssetMissing({
          path,
          status: response.status,
        });
      }
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
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

// 15 digits max keeps the parsed value below Number.MAX_SAFE_INTEGER.
const CARD_FILENAME = /^([1-9]\d{0,14})\.([a-z]+)$/;

function parseEntryId(filename: string, extension: string): number | null {
  const [, digits, named] = CARD_FILENAME.exec(filename) ?? [];
  if (digits === undefined || named !== extension) return null;
  return Number.parseInt(digits, 10);
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}
