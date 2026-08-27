import type { AppContext } from "plumix/plugin";
import { ruleLabel, withBasePath } from "plumix";

import type { CardInputs } from "../card-identity.js";
import type { CardRule } from "../card.js";
import type { CardRenderer } from "../renderer.js";
import { buildCardArgs, renderCardBytes, SANDBOX_CSP } from "../card-render.js";
import { OG_ROUTE_PREFIX } from "../card-route.js";
import { cardSize } from "../card.js";
import { extensionFor } from "../renderer.js";
import { sampleDataFor } from "./sample-data.js";

/** Where the plugin mounts the preview, relative to its own prefix. */
export const PREVIEW_ROUTE_PATH = "/preview/*";

// The same path once mounted, which is what the index's own links are written
// against.
const PREVIEW_URL_PREFIX = `${OG_ROUTE_PREFIX}/preview`;

const NO_STORE = "no-store";

export interface PreviewRouteOptions {
  readonly renderer: CardRenderer;
  /** Every rule the registry holds, in declaration order. */
  readonly rules: () => readonly CardRule[];
  /** The fonts and tokens a published card would render with. */
  readonly inputs: () => CardInputs;
}

/**
 * `GET /_plumix/og/preview` — every declared card rule rendered against sample
 * data, and `/_plumix/og/preview/<n>.<ext>` for one of them on its own.
 *
 * Registered only under the development gate, so neither path exists in a
 * production build. Storage and the cache are both bypassed, which is a
 * requirement rather than a convenience: a card is content-addressed, so every
 * edit lands on a different URL with the previous render sitting immutable in
 * the bucket, and without the bypass the authoring loop is copy-pasting URLs
 * out of page source.
 */
export function createPreviewRoute(
  options: PreviewRouteOptions,
): (request: Request, ctx: AppContext) => Promise<Response> {
  const { renderer, rules, inputs } = options;
  // A format with no extension has no URL to serve a card at, so the route is
  // decided here rather than re-asked on every request — the same call the card
  // route makes about the same renderer.
  const extension = extensionFor(renderer.contentType);
  if (extension === undefined) return () => Promise.resolve(notFound());

  return async (request, ctx) => {
    const rest = new URL(request.url).pathname.slice(PREVIEW_URL_PREFIX.length);
    const declared = inPrecedenceOrder(rules());
    if (rest === "" || rest === "/") {
      return html(indexPage(declared, extension, ctx));
    }

    const index = parseRuleIndex(rest.slice(1), extension);
    const rule = index === null ? undefined : declared[index];
    if (rule === undefined) return notFound();

    const { card } = rule;
    const rendered = inputs();
    const bytes = await renderCardBytes({
      card,
      args: await buildCardArgs(
        card,
        sampleDataFor(rule),
        ctx,
        rendered.tokens,
      ),
      ctx,
      renderer,
      inputs: rendered,
    });
    // `slice` copies into the plain `ArrayBuffer` a response body has to view.
    return new Response(bytes.slice(), {
      headers: {
        "content-type": renderer.contentType,
        "cache-control": NO_STORE,
        "content-security-policy": SANDBOX_CSP,
        "x-content-type-options": "nosniff",
      },
    });
  };
}

/**
 * The rules in the order a node is actually resolved against them, which is not
 * the order they were declared in: `resolveRule` walks targeted matchers first,
 * then the generic tier for the node's kind, then `fallback`. Listing them as
 * declared would tell a developer the opposite of what happens — a
 * `card.entry()` declared above `card.forEntryType("post")` would look like the
 * winner on a post, while the panel on that post's page names the other one.
 *
 * Stable within each band, so two rules of the same standing keep the order the
 * theme wrote them in, which is the tie-break `resolveRule` itself applies.
 */
function inPrecedenceOrder(rules: readonly CardRule[]): readonly CardRule[] {
  return [...rules].sort((a, b) => precedence(a) - precedence(b));
}

function precedence(rule: CardRule): number {
  if (rule.match !== undefined) return 0;
  return rule.tier === "fallback" ? 2 : 1;
}

// `<n>.<ext>`, where `n` indexes the precedence order the index page listed.
// The label is not the identifier: two rules of the same tier, or two matchers
// narrowed by different predicates, share one. Four digits is well past any
// rule set a theme hand-writes, and keeps a crafted URL from allocating.
const PREVIEW_FILENAME = /^(0|[1-9]\d{0,3})\.([a-z]+)$/;

function parseRuleIndex(filename: string, extension: string): number | null {
  const [, digits, named] = PREVIEW_FILENAME.exec(filename) ?? [];
  if (digits === undefined || named !== extension) return null;
  return Number.parseInt(digits, 10);
}

function indexPage(
  rules: readonly CardRule[],
  extension: string,
  ctx: AppContext,
): string {
  const figures = rules
    .map((rule, index) => previewFigure(rule, index, extension, ctx))
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>OG card preview</title>
<style>${STYLES}</style></head><body>
<h1>OG card preview</h1>
<p class="note">${describeSet(rules.length)}</p>
${figures}
</body></html>`;
}

function describeSet(count: number): string {
  return count === 1
    ? "One card rule, rendered against sample data. It re-renders on every refresh."
    : `${String(count)} card rules, in the order a page resolves against them, rendered against sample data. Each re-renders on every refresh.`;
}

function previewFigure(
  rule: CardRule,
  index: number,
  extension: string,
  ctx: AppContext,
): string {
  const { width, height } = cardSize(rule.card);
  const label = escapeAttr(`${String(index)}. ${ruleLabel(rule)}`);
  const kind = escapeAttr(sampleDataFor(rule).kind);
  const href = escapeAttr(
    withBasePath(
      `${PREVIEW_URL_PREFIX}/${String(index)}.${extension}`,
      ctx.basePath,
    ),
  );
  return `<figure>
<a href="${href}"><img src="${href}" width="${String(width)}" height="${String(height)}" alt="${label}"/></a>
<figcaption>${label} <span class="kind">${kind}</span></figcaption>
</figure>`;
}

const STYLES = `
:root { color-scheme: light dark; }
body { margin: 0 auto; padding: 32px; max-width: 1264px;
  font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
.note { margin: 0 0 32px; opacity: 0.7; }
figure { margin: 0 0 32px; }
img { display: block; width: 100%; height: auto;
  border: 1px solid rgb(128 128 128 / 0.4); border-radius: 8px; }
figcaption { margin-top: 8px; font-family: ui-monospace, monospace; }
.kind { opacity: 0.6; }
`;

function html(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": NO_STORE,
    },
  });
}

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": NO_STORE },
  });
}

// Quotes included, unlike core's own `escapeHtml`: every interpolation on this
// page but one lands inside an attribute.
function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
