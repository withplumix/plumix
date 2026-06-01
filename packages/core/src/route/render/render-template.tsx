import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type {
  BlockNode,
  LoaderErrorEvent,
  ResolvedBlockLoaders,
  ThemeTokens,
} from "@plumix/blocks";
import { resolveBlockLoaders } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import type { AppContext } from "../../context/app.js";
import type { RegisteredTemplateDep } from "../../template-deps.js";
import type { Template } from "../../template.js";
import type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
  TemplateData,
  TemplateRegistry,
  ThemeDescriptor,
} from "../../theme.js";
import type { AssetManifest } from "./asset-manifest.js";
import type { ErrorData } from "./resolved-entry.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import { mergeDocumentManifest } from "../../document-merge.js";
import {
  loadTemplateDeps,
  mergeTemplateDepDeclarations,
} from "../../template-deps.js";
import { normalizeTemplate } from "../../template.js";
import { validateDocumentManifest } from "../../theme.js";
import { bundledCssTags } from "./asset-manifest.js";
import { injectIslandsBootstrap } from "./inject-islands-bootstrap.js";
import { resolveTemplateCandidates } from "./template-hierarchy.js";

interface RenderArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly document: DocumentManifest;
  readonly templateDocuments: ReadonlyMap<string, DocumentManifest>;
  readonly templateDeps: ReadonlyMap<string, RegisteredTemplateDep>;
  readonly assetManifest: AssetManifest;
  readonly node: ResolvedNode;
  readonly data: TemplateData;
  readonly title: string;
}

export async function renderThroughTheme({
  ctx,
  theme,
  document,
  templateDocuments,
  templateDeps,
  assetManifest,
  node,
  data,
  title,
}: RenderArgs): Promise<string> {
  const candidates = await resolveTemplateCandidates(node, ctx.hooks);
  const { template, slot } = pickTemplate(theme.templates, candidates);
  const deps = await loadTemplateDeps(
    mergeTemplateDepDeclarations(
      theme,
      template as unknown as Record<string, unknown>,
    ),
    templateDeps,
    ctx,
  );
  const renderDocument = resolveRenderDocument({
    template,
    slot,
    document,
    templateDocuments,
    data,
    ctx,
    deps,
  });
  const loaderData = await prefetchEntryLoaders(ctx, data, template);
  return renderTree({
    ctx,
    document: renderDocument,
    assetManifest,
    data,
    title: composeTitle(renderDocument, title),
    template,
    deps,
    loaderData,
    tokens: theme.tokens,
  });
}

// String form falls back to the resolver title instead of substituting
// `undefined`, dodging unhead's `"%s · Site"` → `" · Site"` orphan separator.
function composeTitle(document: DocumentManifest, fallback: string): string {
  const { title, titleTemplate } = document;
  if (typeof titleTemplate === "function") return titleTemplate(title);
  if (typeof titleTemplate === "string" && title !== undefined) {
    return titleTemplate.replaceAll("%s", title);
  }
  return title ?? fallback;
}

interface RenderErrorArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly document: DocumentManifest;
  readonly templateDocuments: ReadonlyMap<string, DocumentManifest>;
  readonly templateDeps: ReadonlyMap<string, RegisteredTemplateDep>;
  readonly assetManifest: AssetManifest;
  readonly kind: "not-found" | "server-error";
  readonly data: ErrorData;
}

const ERROR_VARIANTS = {
  "not-found": { key: "404", title: "Not Found", fallback: DefaultNotFound },
  "server-error": {
    key: "500",
    title: "Internal Server Error",
    fallback: DefaultServerError,
  },
} as const;

export async function renderErrorThroughTheme({
  ctx,
  theme,
  document,
  templateDocuments,
  templateDeps,
  assetManifest,
  kind,
  data,
}: RenderErrorArgs): Promise<string> {
  const variant = ERROR_VARIANTS[kind];
  const raw = theme.templates[variant.key] ?? variant.fallback;
  const template = normalizeTemplate(raw, variant.key);
  const deps = await loadTemplateDeps(
    mergeTemplateDepDeclarations(
      theme,
      template as unknown as Record<string, unknown>,
    ),
    templateDeps,
    ctx,
  );
  const renderDocument = resolveRenderDocument({
    template,
    slot: variant.key,
    document,
    templateDocuments,
    data,
    ctx,
    deps,
  });
  return renderTree({
    ctx,
    document: renderDocument,
    assetManifest,
    data,
    // Seed variant.title so theme titleTemplate composes a final string;
    // an error template's own `title` still wins via the `??`.
    title: composeTitle(
      { ...renderDocument, title: renderDocument.title ?? variant.title },
      variant.title,
    ),
    template,
    deps,
    loaderData: undefined,
    tokens: theme.tokens,
  });
}

async function prefetchEntryLoaders(
  ctx: AppContext,
  data: TemplateData,
  template: Template<TemplateData>,
): Promise<ResolvedBlockLoaders | undefined> {
  const blocks = collectLoaderBlocks(data, template);
  if (blocks.length === 0) return undefined;
  return resolveBlockLoaders(blocks, ctx.blocks, ctx, {
    // Fire-and-forget bridge into the framework filter so plugins can
    // subscribe via `addFilter("blocks:loader:error", ...)`. `applyFilter`
    // is async; we don't await (the loader resolver shouldn't back-pressure
    // on observability), but we DO catch — a throwing subscriber would
    // otherwise surface as an unhandledRejection and on workers that
    // kills the request. `LoaderErrorEvent` shape matches `BlockLoaderErrorContext`.
    onLoaderError: (event: LoaderErrorEvent) => {
      ctx.hooks
        .applyFilter("blocks:loader:error", undefined, event)
        .catch((hookError: unknown) => {
          ctx.logger.error("[plumix] blocks:loader:error hook threw", {
            hookError,
            blockName: event.spec.name,
            nodeId: event.node.id,
          });
        });
    },
  });
}

function collectLoaderBlocks(
  data: TemplateData,
  template: Template<TemplateData>,
): readonly BlockNode[] {
  if ("entry" in data) return data.entry.contentBlocks?.blocks ?? [];
  if (!("entries" in data)) return [];
  if (!template.prefetchListingLoaders) return [];
  return data.entries.flatMap((e) => e.contentBlocks?.blocks ?? []);
}

interface ResolveDocumentArgs {
  readonly template: Template<TemplateData>;
  readonly slot: string;
  readonly document: DocumentManifest;
  readonly templateDocuments: ReadonlyMap<string, DocumentManifest>;
  readonly data: TemplateData;
  readonly ctx: AppContext;
  readonly deps: Record<string, Record<string, unknown>>;
}

function resolveRenderDocument({
  template,
  slot,
  document,
  templateDocuments,
  data,
  ctx,
  deps,
}: ResolveDocumentArgs): DocumentManifest {
  const fragment = template.document;
  if (typeof fragment !== "function") {
    return templateDocuments.get(slot) ?? document;
  }
  const resolved = fragment({ ...deps, data, ctx });
  const merged = mergeDocumentManifest(document, resolved);
  validateDocumentManifest(merged, slot);
  return merged;
}

interface RenderTreeArgs {
  readonly ctx: AppContext;
  readonly document: DocumentManifest;
  readonly assetManifest: AssetManifest;
  readonly data: TemplateData;
  readonly title: string;
  readonly template: Template<TemplateData>;
  readonly deps: Record<string, Record<string, unknown>>;
  readonly loaderData: ResolvedBlockLoaders | undefined;
  readonly tokens: ThemeTokens | undefined;
}

// React 19 reorders every child of `<head>` (metadata first, scripts /
// templates last), so we can't rely on JSX position to control where
// theme `script[]` lands. We render only the body subtree via React
// (capturing hoisted `<title>`/`<meta>`/`<link>`/`<script>` at the
// start of the output) and assemble the full document as a string
// template — Astro's approach for the same reason.
function renderTree({
  ctx,
  document,
  assetManifest,
  data,
  title,
  template,
  deps,
  tokens,
  loaderData,
}: RenderTreeArgs): string {
  // Adapter FC wraps `template.render({ data, ctx, ...deps })` so it
  // executes inside React's render pass — hooks (useState, useId,
  // useMemo, useSyncExternalStore) inside a factory template are
  // legal. A direct call here would throw "Invalid hook call" because
  // React's dispatcher isn't set yet at this construction point.
  // `data` + `ctx` are framework-owned; spread `deps` first so a
  // misregistered dep kind literally named `"data"` or `"ctx"` can't
  // silently clobber the canonical args.
  const TemplateAdapter = (): ReactNode =>
    template.render({ ...deps, data, ctx });
  const templateTree: ReactNode = createElement(PlumixProvider, {
    value: { registry: ctx.blocks, tokens, loaderData },
    children: createElement(TemplateAdapter),
  });
  const rendered = renderToString(templateTree);
  const { hoisted, body } = splitHoistedMetadata(rendered);

  const scripts = groupScriptsByPosition(document.script);

  const { code, direction } = ctx.i18n.defaultLocale;
  const htmlAttrs = renderAttrs({
    lang: code,
    dir: direction,
    ...document.html,
  });
  const bodyAttrs = renderAttrs(document.body);

  // A template-rendered `<title>` is part of `hoisted`. Browsers honor the
  // first `<title>` in document order, so emitting the framework default
  // first would shadow the template's choice — skip it in that case.
  const titleFallback = hoistedHasTitle(hoisted)
    ? ""
    : `<title>${escapeHtml(title)}</title>`;

  // Bundled CSS lands AFTER theme `link[]` so theme-local stylesheets
  // override CDN imports declared in `link[]` (last-wins cascade).
  const headContent =
    scripts.headStart.map(scriptToHtml).join("") +
    '<meta charSet="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    hoisted +
    titleFallback +
    voidTagsToHtml("link", document.link) +
    bundledCssTags(assetManifest) +
    voidTagsToHtml("meta", document.meta) +
    scripts.headEnd.map(scriptToHtml).join("");

  const bodyContent =
    scripts.bodyStart.map(scriptToHtml).join("") +
    injectIslandsBootstrap(
      body,
      assetManifest,
      // `process.env.PLUMIX_DEV` is Vite-substituted at SSR-bundle time
      // — non-empty in `plumix dev`, empty in `plumix build`. The
      // plumix Vite plugin's `define` populates the literal.
      process.env.PLUMIX_DEV ? "serve" : "build",
    ) +
    scripts.bodyEnd.map(scriptToHtml).join("") +
    HYDRATION_SLOT;

  return (
    "<!doctype html>" +
    `<html${htmlAttrs}>` +
    `<head>${headContent}</head>` +
    `<body${bodyAttrs}>${bodyContent}</body>` +
    "</html>"
  );
}

function hoistedHasTitle(hoisted: string): boolean {
  return /<title\b/i.test(hoisted);
}

const HYDRATION_SLOT = "<!--plumix-hydration-slot-->";

// Template-tree metadata (`<title>` / `<meta>` / `<link>` / `<script>`)
// rendered at the start of the JSX lands at the start of the
// `renderToString` output. Split that prefix off so we can re-insert
// it into the string-built `<head>` while keeping the body markup
// downstream. The sticky regex matches only at `lastIndex`, but
// `RegExp.exec` resets `lastIndex` to 0 on a failed match — track the
// cursor explicitly through successful matches.
function splitHoistedMetadata(rendered: string): {
  hoisted: string;
  body: string;
} {
  HOISTED_TAG_RE.lastIndex = 0;
  let cursor = 0;
  while (HOISTED_TAG_RE.exec(rendered)) {
    cursor = HOISTED_TAG_RE.lastIndex;
  }
  return { hoisted: rendered.slice(0, cursor), body: rendered.slice(cursor) };
}

// Case-insensitive: React's `renderToString` always emits lowercase tag
// names, but the regex still needs `i` to satisfy code-scanning that
// (correctly) treats case-sensitive HTML filters as fragile.
const HOISTED_TAG_RE =
  /<(?:title\b[^>]*>[^<]*<\/title>|script\b[^>]*>[^<]*<\/script>|(?:meta|link)\b[^>]*\/?>)/iy;

type ScriptPosition = "headStart" | "headEnd" | "bodyStart" | "bodyEnd";

function groupScriptsByPosition(
  scripts: readonly DocumentScript[] | undefined,
): Record<ScriptPosition, DocumentScript[]> {
  const out: Record<ScriptPosition, DocumentScript[]> = {
    headStart: [],
    headEnd: [],
    bodyStart: [],
    bodyEnd: [],
  };
  for (const s of scripts ?? []) {
    out[s.position ?? "bodyEnd"].push(s);
  }
  return out;
}

// `children` (string) wins over `dangerouslySetInnerHTML.__html` when both
// are provided — JSX semantics. Both are emitted verbatim; the theme
// author is trusted to produce valid script content.
function scriptToHtml(script: DocumentScript): string {
  const { position, children, dangerouslySetInnerHTML, ...attrs } = script;
  void position;
  const inner = children ?? dangerouslySetInnerHTML?.__html ?? "";
  return `<script${renderAttrs(attrs)}>${inner}</script>`;
}

function voidTagsToHtml(
  tag: "link" | "meta",
  items: readonly (DocumentLink | DocumentMeta)[] | undefined,
): string {
  if (!items) return "";
  return items.map((attrs) => `<${tag}${renderAttrs(attrs)}/>`).join("");
}

function renderAttrs(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return "";
  let out = "";
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === undefined || value === null) continue;
    const attrName = jsxAttrToHtml(key);
    if (value === true) {
      out += ` ${attrName}`;
      continue;
    }
    if (typeof value !== "string" && typeof value !== "number") continue;
    out += ` ${attrName}="${escapeAttr(String(value))}"`;
  }
  return out;
}

// JSX uses camelCase attribute names that React's renderToString
// translates on emit (`className` → `class`, `httpEquiv` → `http-equiv`,
// etc.). Mirror the subset that matters for theme document attrs so a
// theme written in JSX flavor produces valid HTML.
const JSX_ATTR_MAP: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  charSet: "charset",
  httpEquiv: "http-equiv",
  crossOrigin: "crossorigin",
  referrerPolicy: "referrerpolicy",
  acceptCharset: "accept-charset",
  itemProp: "itemprop",
  itemScope: "itemscope",
  itemType: "itemtype",
};

function jsxAttrToHtml(name: string): string {
  return JSX_ATTR_MAP[name] ?? name;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function pickTemplate(
  templates: TemplateRegistry,
  candidates: readonly string[],
): { template: Template<TemplateData>; slot: string } {
  // The candidate list is derived from the route's kind, so the picked
  // template's narrowed data shape always matches the runtime `data`.
  // Normalize at the boundary — accepts both plain function templates
  // (legacy) and factory-built `Template<T>` objects. The returned
  // `slot` keys per-template document lookups on the app's precomputed
  // `templateDocuments` map.
  for (const name of candidates) {
    const candidate = templates[name];
    if (candidate)
      return { template: normalizeTemplate(candidate, name), slot: name };
  }
  return {
    template: normalizeTemplate(templates.index, "index"),
    slot: "index",
  };
}

function DefaultNotFound() {
  return (
    <main>
      <h1>Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
    </main>
  );
}

function DefaultServerError() {
  return (
    <main>
      <h1>Internal Server Error</h1>
      <p>Something went wrong while rendering this page.</p>
    </main>
  );
}
