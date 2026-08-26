import type { EntryData, ResolvedNode, TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import {
  buildResolvedEntries,
  loadTemplateDeps,
  serveRenderedAsset,
} from "plumix";
import { and, eq } from "plumix/db";
import { entries } from "plumix/schema";

import type { CardRegistry } from "./card-registry.js";
import type { CardArgs } from "./card.js";
import type { CardRenderer } from "./renderer.js";
import { cardStorageKey } from "./card-key.js";
import { cardSourceHash } from "./card-source.js";
import { OgPluginError } from "./errors.js";
import { CARD_HEIGHT, CARD_WIDTH, extensionFor } from "./renderer.js";

/** Where the plugin mounts the route, relative to its own prefix. */
export const CARD_ROUTE_PATH = "/entry/*";

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
  const extension = extensionFor(renderer.contentType);

  return async (request, ctx) => {
    if (extension === undefined) return notFound();

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

    const response = await serveRenderedAsset({
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
    response.headers.set("content-security-policy", SANDBOX_CSP);
    return response;
  };
}

/**
 * Fonts come from the platform asset layer rather than the Worker bundle, so
 * adding cards costs no deployment size. The engine reads TTF, OTF and WOFF —
 * not WOFF2, which is what most font packages ship.
 *
 * A declared font that cannot be read fails the request rather than rendering
 * without it: the engine's fallback face would silently answer 200 with a card
 * nobody meant to publish.
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
    .where(and(eq(entries.id, id), eq(entries.status, "published")))
    .limit(1);
  if (!row) return null;
  // A card is a public artefact: a type the site does not publish has no
  // shareable page, so it gets no shareable image either. An unregistered type
  // — a row left behind by a plugin the config no longer installs — has no page
  // at all, so it is the same answer.
  const entryType = ctx.plugins.entryTypes.get(row.type);
  if (entryType === undefined || entryType.isPublic === false) return null;

  const [entry] = await buildResolvedEntries(ctx, [row]);
  if (entry === undefined) return null;
  return {
    node: {
      kind: "content",
      entryType: row.type,
      slug: row.slug,
      databaseId: row.id,
    },
    data: { kind: "entry", entry },
  };
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
