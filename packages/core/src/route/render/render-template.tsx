import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type {
  BlockNode,
  BlockRenderFilters,
  CompiledCatalog,
  HtmlAllowlist,
  LoaderErrorEvent,
  ResolvedBlockLoaders,
  ThemeBreakpoints,
  ThemeTokens,
} from "../../blocks/index.js";
import type { AppContext } from "../../context/app-context.js";
import type { SettingsBag } from "../../db/schema/settings.js";
import type {
  DocumentAttrs,
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
} from "../../document-manifest.js";
import type { TransformOpts } from "../../runtime/contract/slots.js";
import type { LoadedTemplateDeps } from "../../template-deps.js";
import type { Template } from "../../template.js";
import type { ResolvedViewTransitions } from "../../theme-view-transitions.js";
import type { TemplateData, ThemeDescriptor } from "../../theme.js";
import type { PageOutcome } from "../contract/page-outcome.js";
import type { ErrorData } from "../contract/resolved-entry.js";
import type { EditModeDecision } from "../edit-mode.js";
import type { AssetManifest, ViteCommand } from "./asset-manifest.js";
import type { RenderChrome, RenderEnv } from "./render-env.js";
import type { ResolvedNode } from "./rule-resolver.js";
import type { TemplateResolution } from "./template-hierarchy.js";
import {
  BlockLoaderError,
  HtmlAllowlistProvider,
  resolveBlockLoaders,
} from "../../blocks/index.js";
import { PlumixProvider } from "../../blocks/renderer/index.js";
import { mergeDocumentManifest } from "../../document-merge.js";
import { escapeHtml } from "../../escape-html.js";
import { nonEmpty } from "../../non-empty.js";
import { applyCanonical } from "../../seo/canonical.js";
import { loadSiteSettings } from "../../seo/site-settings.js";
import {
  loadTemplateDeps,
  mergeTemplateDepDeclarations,
} from "../../template-deps.js";
import { normalizeTemplate } from "../../template.js";
import {
  resolveViewTransitions,
  viewTransitionsScriptTag,
  viewTransitionsStyleTag,
} from "../../theme-view-transitions.js";
import { validateDocumentManifest } from "../../theme.js";
import { isPageOutcome } from "../contract/page-outcome.js";
import { LIVE_EDIT_MODE } from "../edit-mode.js";
import {
  bundledCssTags,
  devThemeCssLinks,
  devThemeStylesTag,
} from "./asset-manifest.js";
import { injectEditorBootstrap } from "./inject-editor-bootstrap.js";
import { injectIslandsBootstrap } from "./inject-islands-bootstrap.js";
import { ruleLabel } from "./rule-resolver.js";
import { templateRules } from "./template-builders.js";
import {
  explainTemplateResolution,
  resolveErrorTemplate,
  resolveTemplate,
} from "./template-hierarchy.js";
import { TEMPLATE_PANEL_ID, templateNodeLabel } from "./template-node-label.js";

declare module "../../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Fires on the assembled document, so theme tags are already present. Also
     * fires on error renders (`kind: "error"`), where a throwing subscriber is
     * logged and skipped.
     */
    "render:document": (
      manifest: DocumentManifest,
      data: TemplateData,
      ctx: AppContext,
      title: string,
    ) => DocumentManifest | Promise<DocumentManifest>;
  }
}

interface RenderArgs {
  readonly ctx: AppContext;
  readonly renderEnv: RenderEnv;
  readonly node: ResolvedNode;
  readonly data: TemplateData;
  readonly title: string;
  readonly editMode?: EditModeDecision;
}

/**
 * Render a resolved node through the theme. Returns `null` when the theme
 * declares no matching tier and no `fallback` — the caller then renders 404.
 */
export function renderThroughTheme(args: RenderArgs): Promise<string | null> {
  // The render phase span. With no consumer sampled, `ctx.telemetry` is the
  // no-op collector: span() is a pass-through and the lazy label thunk is
  // never evaluated.
  return args.ctx.telemetry.span("render", (s) => {
    s.set("render.node", () => templateNodeLabel(args.node));
    return renderThroughThemeInner(args);
  });
}

async function renderThroughThemeInner({
  ctx,
  renderEnv,
  node,
  data,
  title,
  editMode = LIVE_EDIT_MODE,
}: RenderArgs): Promise<string | null> {
  const {
    theme,
    document,
    templateDeps,
    assetManifest,
    htmlAllowlist,
    blockCatalogs,
    chrome,
  } = renderEnv;
  const rules = templateRules(theme.templates);
  // The explain is a lazy attribute so an inactive collector never pays for it.
  const matched = ctx.telemetry.span(TEMPLATE_PANEL_ID, (s) => {
    // Resolve first so the explain (which re-runs user predicates) keeps the
    // old resolve-then-explain order for any stateful predicate.
    const result = resolveTemplate(rules, node, data);
    s.set("resolution", (): TemplateResolution => ({
      nodeLabel: templateNodeLabel(node),
      ...explainTemplateResolution(rules, node, data),
    }));
    return result;
  });
  if (matched === undefined) return null;
  const matchedLabel = ruleLabel(matched);
  ctx.resolvedTemplate = matchedLabel;
  const template = normalizeTemplate(matched.template, matchedLabel);
  const deps = await loadTemplateDeps(
    mergeTemplateDepDeclarations(theme, template),
    templateDeps,
    ctx,
  );
  // Before `document()`, so a loader that ends the request (ADR 0032) stops
  // the render before any of the page is built.
  const loaderData = await prefetchEntryLoaders(ctx, data, template, editMode);
  const merged = await resolveRenderDocument({
    template,
    document,
    data,
    ctx,
    deps,
  });
  // A view is a per-visitor page, so it claims no canonical address unless
  // its `document` declares a canonical link of its own (ADR 0035).
  const pageDocument: DocumentManifest =
    data.kind === "view" ? { ...merged, canonical: false } : merged;
  const filtered = await ctx.hooks.applyFilter(
    "render:document",
    pageDocument,
    data,
    ctx,
    title,
  );
  // The `<title>` fallback reads site settings from the DB — worth its own row
  // in the waterfall. The `render:document` subscribers above are already
  // traced per handler as `hook:` spans.
  const site = await ctx.telemetry.span("render: head", () =>
    loadSiteSettings(ctx),
  );
  const renderDocument = applyCanonical(filtered, ctx);
  // The `<title>` falls back to the resolver title, then the site name — so an
  // untitled entry gets `<title>Site</title>`, not an empty one.
  const titleFallback = nonEmpty(title) ?? nonEmpty(site.title) ?? title;
  return renderTree({
    ctx,
    document: renderDocument,
    assetManifest,
    data,
    title: composeTitle(renderDocument, titleFallback),
    template,
    deps,
    loaderData,
    siteSettings: site,
    tokens: theme.tokens,
    breakpoints: theme.breakpoints,
    htmlAllowlist,
    chrome,
    catalog: await blockCatalogs(ctx.locale.code),
    themeCss: theme.css ?? [],
    // The editor canvas and a draft preview are plain renders: never animated.
    viewTransitions:
      editMode.mode === "live" ? pageViewTransitions(theme, template) : null,
    editMode,
  });
}

/** A template's setting replaces the theme's for the pages it renders. */
function pageViewTransitions(
  theme: ThemeDescriptor,
  template: Template,
): ResolvedViewTransitions | null {
  return resolveViewTransitions(
    template.viewTransitions ?? theme.viewTransitions,
  );
}

/**
 * String form falls back to the resolver title instead of substituting
 * `undefined`, dodging unhead's `"%s · Site"` → `" · Site"` orphan separator.
 */
function composeTitle(document: DocumentManifest, fallback: string): string {
  const { titleTemplate } = document;
  // An empty title (an untitled entry) is treated as absent, so the fallback
  // / the template's no-title branch applies instead of emitting an empty
  // `<title>` or an orphaned " · Site" separator.
  const title = document.title === "" ? undefined : document.title;
  if (typeof titleTemplate === "function") return titleTemplate(title);
  if (typeof titleTemplate === "string" && title !== undefined) {
    // A function replacement, so `$&` / `$\`` / `$'` in a title — "Q&A: $&
    // explained" — are the characters an author typed rather than replacement
    // patterns.
    return titleTemplate.replaceAll("%s", () => title);
  }
  return title ?? fallback;
}

interface RenderErrorArgs {
  readonly ctx: AppContext;
  readonly renderEnv: RenderEnv;
  readonly kind: "not-found" | "server-error";
  readonly data: ErrorData;
}

const ERROR_VARIANTS = {
  "not-found": {
    tier: "notFound",
    title: "Not Found",
    fallback: DefaultNotFound,
  },
  "server-error": {
    tier: "serverError",
    title: "Internal Server Error",
    fallback: DefaultServerError,
  },
} as const;

export function renderErrorThroughTheme(
  args: RenderErrorArgs,
): Promise<string> {
  // Same phase span as the happy path — without it the error render's queries
  // dangle directly under `dispatch` in the trace (#1491).
  return args.ctx.telemetry.span("render", (s) => {
    s.set("render.node", `error: ${ERROR_VARIANTS[args.kind].tier}`);
    return renderErrorThroughThemeInner(args);
  });
}

async function renderErrorThroughThemeInner({
  ctx,
  renderEnv,
  kind,
  data,
}: RenderErrorArgs): Promise<string> {
  const {
    theme,
    document,
    templateDeps,
    assetManifest,
    htmlAllowlist,
    blockCatalogs,
    chrome,
  } = renderEnv;
  const variant = ERROR_VARIANTS[kind];
  const raw =
    resolveErrorTemplate(templateRules(theme.templates), variant.tier)
      ?.template ?? variant.fallback;
  const template = normalizeTemplate(raw, variant.tier);
  const deps = await loadTemplateDeps(
    mergeTemplateDepDeclarations(theme, template),
    templateDeps,
    ctx,
  );
  const merged = await resolveRenderDocument({
    template,
    document,
    data,
    ctx,
    deps,
  });
  // No `applyCanonical`: a URL that resolved to nothing must not claim to be
  // canonical. Caught because a throwing subscriber would turn a clean 404 into
  // a themed 500.
  const renderDocument = await applyErrorDocumentFilter({
    ctx,
    merged,
    data,
    title: variant.title,
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
    // No settings read: this render is already the failure path, and one
    // more DB round-trip here would let a database fault turn a 404 into a 500.
    siteSettings: undefined,
    tokens: theme.tokens,
    breakpoints: theme.breakpoints,
    htmlAllowlist,
    chrome,
    catalog: await blockCatalogs(ctx.locale.code),
    themeCss: theme.css ?? [],
    viewTransitions: pageViewTransitions(theme, template),
    editMode: LIVE_EDIT_MODE,
  });
}

interface ErrorDocumentArgs {
  readonly ctx: AppContext;
  readonly merged: DocumentManifest;
  readonly data: ErrorData;
  readonly title: string;
}

async function applyErrorDocumentFilter({
  ctx,
  merged,
  data,
  title,
}: ErrorDocumentArgs): Promise<DocumentManifest> {
  try {
    return await ctx.hooks.applyFilter(
      "render:document",
      merged,
      data,
      ctx,
      title,
    );
  } catch (error) {
    ctx.logger.error("render:document failed on the error page", {
      err: error,
    });
    return merged;
  }
}

async function prefetchEntryLoaders(
  ctx: AppContext,
  data: TemplateData,
  template: Template,
  editMode: EditModeDecision,
): Promise<ResolvedBlockLoaders | undefined> {
  const blocks = collectLoaderBlocks(data, template);
  if (blocks.length === 0) return undefined;
  // Not in the editor, which has to stay editable; elsewhere a thrown outcome
  // is an ordinary block rejection.
  const honoursOutcome = "entry" in data && editMode.mode !== "edit";
  let pageOutcome: PageOutcome | undefined;
  // Dev-only: the first loader rejection, captured so it can be escalated to a
  // fatal error after the fan-out settles (prod leaves it `undefined` and keeps
  // per-block isolation).
  let firstLoaderError: LoaderErrorEvent | undefined;
  // Loader fan-out gets its own span so the DB/fetch work it triggers nests
  // here instead of parenting onto `render` directly.
  const loaderData = await ctx.telemetry.span("render: loaders", (s) => {
    s.set("loaders.blocks", blocks.length);
    return resolveBlockLoaders(blocks, ctx.blocks, ctx, {
      // Not awaited, so observability never back-pressures loaders; caught,
      // because an unhandled rejection kills a Workers request.
      onLoaderError: (event: LoaderErrorEvent) => {
        if (honoursOutcome && isPageOutcome(event.error)) {
          pageOutcome ??= event.error;
          return;
        }
        firstLoaderError ??= event;
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
  });
  if (pageOutcome !== undefined) throw pageOutcome;
  // Dev escalates so the error page names the culprit block; production keeps
  // per-block isolation.
  if (process.env.PLUMIX_DEV && firstLoaderError) {
    throw new BlockLoaderError(firstLoaderError);
  }
  return loaderData;
}

function collectLoaderBlocks(
  data: TemplateData,
  template: Template,
): readonly BlockNode[] {
  if ("entry" in data) return data.entry.contentBlocks?.blocks ?? [];
  if (!("entries" in data)) return [];
  if (!template.prefetchArchiveLoaders) return [];
  return data.entries.flatMap((e) => e.contentBlocks?.blocks ?? []);
}

interface ResolveDocumentArgs {
  readonly template: Template;
  readonly document: DocumentManifest;
  readonly data: TemplateData;
  readonly ctx: AppContext;
  readonly deps: LoadedTemplateDeps;
}

/**
 * Merge the matched template's `document` fragment (a literal or a per-request
 * function) onto the theme-wide document. No fragment → the theme document.
 */
async function resolveRenderDocument({
  template,
  document,
  data,
  ctx,
  deps,
}: ResolveDocumentArgs): Promise<DocumentManifest> {
  const fragment = template.document;
  if (fragment === undefined) return document;
  const resolved =
    typeof fragment === "function"
      ? await fragment({ ...deps, data, ctx })
      : fragment;
  const merged = mergeDocumentManifest(document, resolved);
  validateDocumentManifest(merged);
  return merged;
}

interface RenderTreeArgs {
  readonly ctx: AppContext;
  readonly document: DocumentManifest;
  readonly assetManifest: AssetManifest;
  readonly data: TemplateData;
  readonly title: string;
  readonly template: Template;
  readonly deps: LoadedTemplateDeps;
  readonly loaderData: ResolvedBlockLoaders | undefined;
  readonly siteSettings: SettingsBag | undefined;
  readonly tokens: ThemeTokens | undefined;
  readonly breakpoints: ThemeBreakpoints | undefined;
  readonly htmlAllowlist: HtmlAllowlist;
  readonly chrome: RenderChrome;
  readonly catalog: CompiledCatalog;
  /** The theme's `css: []` paths, linked in dev to avoid FOUC (#1701). */
  readonly themeCss: readonly string[];
  readonly viewTransitions: ResolvedViewTransitions | null;
  readonly editMode: EditModeDecision;
}

/**
 * React 19 reorders `<head>` children, so JSX position can't place theme
 * `script[]`; React renders only the body.
 */
function renderTree({
  ctx,
  document,
  assetManifest,
  data,
  title,
  template,
  deps,
  tokens,
  breakpoints,
  htmlAllowlist,
  chrome,
  catalog,
  loaderData,
  siteSettings,
  themeCss,
  viewTransitions,
  editMode,
}: RenderTreeArgs): string {
  // A component, not a direct call, so hooks in a template run inside React's
  // render pass. `deps` spread first so a dep named `data` or `ctx` can't
  // clobber them.
  const TemplateAdapter = (): ReactNode =>
    template.render({ ...deps, data, ctx });
  const queriedEntry = "entry" in data ? data.entry : undefined;
  // Spread, not asserted: an `interface` lacks the implicit index signature a
  // shortcode's by-name read needs.
  const entry = "entry" in data ? { ...data.entry } : null;
  // Bind once so the resolver closure keeps the non-null narrowing.
  const imageDelivery = ctx.imageDelivery;
  // Bridge into the framework filters so plugins can subscribe via
  // `addFilter("block:before_render" | "block:after_render", ...)`. Sync
  // (not `applyFilter`) because these fire mid-React-render, inside
  // `renderBlockTree`'s walk — see `applyFilterSync`'s own doc comment.
  const renderFilters: BlockRenderFilters = {
    beforeRender: (element, node, blockContext) =>
      ctx.hooks.applyFilterSync("block:before_render", element, {
        node,
        context: blockContext,
      }),
    afterRender: (element, node, blockContext) =>
      ctx.hooks.applyFilterSync("block:after_render", element, {
        node,
        context: blockContext,
      }),
  };
  const templateTree: ReactNode = createElement(
    PlumixProvider,
    {
      value: {
        registry: ctx.blocks,
        mode: editMode.mode,
        tokens,
        breakpoints,
        loaderData,
        // Read on demand: `useUser()` is a principal read, and reading it here
        // would mark every render personal (ADR 0030).
        get user() {
          return ctx.user;
        },
        authMethods: ctx.authMethods,
        queriedEntry: ctx.resolvedEntity,
        locale: ctx.locale.code,
        catalog,
        shortcodes: ctx.shortcodes,
        entry,
        siteSettings,
        basePath: ctx.config.basePath,
        imageResolver: imageDelivery
          ? (src, opts) =>
              imageDelivery.url(src, {
                width: opts?.width,
                quality: opts?.quality,
                // blocks' resolver types `format` loosely as string.
                format: opts?.format as TransformOpts["format"],
              })
          : undefined,
        imageRemotePatterns: ctx.config.images?.remotePatterns,
        renderFilters,
      },
    },
    // In edit mode the bar's `body { padding-top }` and `min-h-screen` loop the
    // auto-sized canvas iframe's height.
    editMode.mode === "edit" ? null : chrome.adminBar(ctx, queriedEntry),
    process.env.PLUMIX_DEV &&
      chrome.debugBar !== undefined &&
      editMode.mode !== "edit"
      ? chrome.debugBar(ctx)
      : null,
    createElement(TemplateAdapter),
  );
  // The bulk of `render` self-time (#1494).
  const rendered = ctx.telemetry.span("render: react", () =>
    renderToString(
      createElement(
        HtmlAllowlistProvider,
        { value: htmlAllowlist },
        templateTree,
      ),
    ),
  );
  const { hoisted, body } = splitHoistedMetadata(rendered);

  const scripts = groupScriptsByPosition(document.script);

  const { code, direction } = ctx.locale;
  const htmlAttrs = renderAttrs({
    lang: code,
    dir: direction,
    ...document.html,
    // The island runtime skips hydration when set, keeping editor islands
    // static and selectable.
    ...(editMode.mode === "edit" ? { "data-plumix-mode": editMode.mode } : {}),
  });
  const bodyAttrs = renderAttrs(document.body);

  // Browsers honor the first `<title>`, so a default would shadow the
  // template's.
  const titleFallback = hoistedHasTitle(hoisted)
    ? ""
    : `<title>${escapeHtml(title)}</title>`;

  // Bundled CSS lands after theme `link[]` so theme stylesheets override CDN
  // imports.
  const command: ViteCommand = process.env.PLUMIX_DEV ? "serve" : "build";

  const headContent =
    scripts.headStart.map(scriptToHtml).join("") +
    '<meta charSet="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    // Render-blocking ahead of every stylesheet, so its `pagereveal` listener
    // is registered before the first frame.
    viewTransitionsScriptTag(viewTransitions) +
    hoisted +
    titleFallback +
    voidTagsToHtml("link", document.link) +
    bundledCssTags(assetManifest, command, ctx.config.basePath) +
    devThemeCssLinks(themeCss, command, ctx.config.basePath) +
    devThemeStylesTag(command, ctx.config.basePath) +
    viewTransitionsStyleTag(viewTransitions) +
    voidTagsToHtml("meta", document.meta) +
    scripts.headEnd.map(scriptToHtml).join("");

  const withIslands = injectIslandsBootstrap(
    body,
    assetManifest,
    command,
    ctx.config.basePath,
  );
  const withRuntimes = injectEditorBootstrap(
    withIslands,
    editMode.injectRuntime,
    assetManifest,
    command,
    ctx.config.basePath,
  );
  const bodyContent =
    scripts.bodyStart.map(scriptToHtml).join("") +
    withRuntimes +
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

/**
 * `RegExp.exec` resets a sticky regex's `lastIndex` to 0 on a failed match, so
 * the cursor is tracked explicitly.
 */
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

/**
 * Case-insensitive: React's `renderToString` always emits lowercase tag
 * names, but the regex still needs `i` to satisfy code-scanning that
 * (correctly) treats case-sensitive HTML filters as fragile.
 */
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

/**
 * `children` (string) wins over `dangerouslySetInnerHTML.__html` when both
 * are provided — JSX semantics. Both are emitted verbatim; the theme
 * author is trusted to produce valid script content.
 */
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

function renderAttrs(attrs: DocumentAttrs | undefined): string {
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

/**
 * Theme document attrs are string-rendered, bypassing React's camelCase-to-HTML
 * attribute translation.
 */
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

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function DefaultNotFound() {
  return (
    <main>
      <h1>Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
    </main>
  );
}

function DefaultServerError({ data }: { data: ErrorData }) {
  return (
    <main>
      <h1>Internal Server Error</h1>
      <p>Something went wrong while rendering this page.</p>
      {data.errorId ? (
        <p>
          Reference ID: <code>{data.errorId}</code>
        </p>
      ) : null}
    </main>
  );
}
