import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type {
  BlockNode,
  LoaderErrorEvent,
  ResolvedBlockLoaders,
  ThemeBreakpoints,
  ThemeTokens,
} from "@plumix/blocks";
import { resolveBlockLoaders } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import type { AppContext } from "../../context/app.js";
import type { JsonValue } from "../../context/telemetry.js";
import type { TransformOpts } from "../../runtime/slots.js";
import type { RegisteredTemplateDep } from "../../template-deps.js";
import type { Template } from "../../template.js";
import type {
  DocumentLink,
  DocumentManifest,
  DocumentMeta,
  DocumentScript,
  TemplateData,
  ThemeDescriptor,
} from "../../theme.js";
import type { EditModeDecision } from "../edit-mode.js";
import type { AssetManifest, ViteCommand } from "./asset-manifest.js";
import type { ErrorData } from "./resolved-entry.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import { PlumixAdminBar } from "../../admin-bar/component.js";
import { PlumixDebugBar } from "../../debug-bar/component.js";
import {
  TEMPLATE_PANEL_ID,
  templateNodeLabel,
} from "../../debug-bar/template-node-label.js";
import { mergeDocumentManifest } from "../../document-merge.js";
import { applyCanonical } from "../../seo/canonical.js";
import { applyHeadMeta } from "../../seo/head-defaults.js";
import {
  loadTemplateDeps,
  mergeTemplateDepDeclarations,
} from "../../template-deps.js";
import { normalizeTemplate } from "../../template.js";
import { validateDocumentManifest } from "../../theme.js";
import { LIVE_EDIT_MODE } from "../edit-mode.js";
import { bundledCssTags, devThemeStylesTag } from "./asset-manifest.js";
import { injectEditorBootstrap } from "./inject-editor-bootstrap.js";
import { injectIslandsBootstrap } from "./inject-islands-bootstrap.js";
import { templateRules } from "./template-builders.js";
import {
  explainTemplateResolution,
  resolveErrorTemplate,
  resolveTemplate,
  ruleLabel,
} from "./template-hierarchy.js";

declare module "../../hooks/types.js" {
  interface FilterRegistry {
    /**
     * Per-request head transform — the entry point for `@plumix/plugin-seo` and
     * any plugin to inject, override, or remove document head fields with the
     * resolved `{data, ctx}` in hand. Fires on the assembled (theme + template)
     * document and before core's SEO gap-fillers, so a subscriber can override
     * any already-set field while core only backfills keys no one set. Real
     * renders only — error pages don't fire it.
     */
    "render:document": (
      manifest: DocumentManifest,
      data: TemplateData,
      ctx: AppContext,
    ) => DocumentManifest | Promise<DocumentManifest>;
  }
}

interface RenderArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly document: DocumentManifest;
  readonly templateDeps: ReadonlyMap<string, RegisteredTemplateDep>;
  readonly assetManifest: AssetManifest;
  readonly node: ResolvedNode;
  readonly data: TemplateData;
  readonly title: string;
  /** Visual-editor decision; defaults to a plain live render. */
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
  theme,
  document,
  templateDeps,
  assetManifest,
  node,
  data,
  title,
  editMode = LIVE_EDIT_MODE,
}: RenderArgs): Promise<string | null> {
  const rules = templateRules(theme.templates);
  // The resolution walk is a `template` span (nested under `render`) carrying
  // the full explain as a lazy attribute — the Template panel reads it back
  // from the span tree, and an inactive collector never pays for the explain.
  const matched = ctx.telemetry.span(TEMPLATE_PANEL_ID, (s) => {
    // Resolve first so the explain (which re-runs user predicates) keeps the
    // old resolve-then-explain order for any stateful predicate.
    const result = resolveTemplate(rules, node, data);
    s.set(
      "resolution",
      () =>
        ({
          nodeLabel: templateNodeLabel(node),
          ...explainTemplateResolution(rules, node, data),
        }) as unknown as JsonValue,
    );
    return result;
  });
  if (matched === undefined) return null;
  const matchedLabel = ruleLabel(matched);
  ctx.resolvedTemplate = matchedLabel;
  const template = normalizeTemplate(matched.template, matchedLabel);
  const deps = await loadTemplateDeps(
    mergeTemplateDepDeclarations(
      theme,
      template as unknown as Record<string, unknown>,
    ),
    templateDeps,
    ctx,
  );
  const merged = resolveRenderDocument({ template, document, data, ctx, deps });
  const filtered = await ctx.hooks.applyFilter(
    "render:document",
    merged,
    data,
    ctx,
  );
  const renderDocument = await applyHeadMeta(
    applyCanonical(filtered, ctx),
    data,
    ctx,
    title,
  );
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
    breakpoints: theme.breakpoints,
    editMode,
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
  readonly templateDeps: ReadonlyMap<string, RegisteredTemplateDep>;
  readonly assetManifest: AssetManifest;
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
  theme,
  document,
  templateDeps,
  assetManifest,
  kind,
  data,
}: RenderErrorArgs): Promise<string> {
  const variant = ERROR_VARIANTS[kind];
  const raw =
    resolveErrorTemplate(templateRules(theme.templates), variant.tier)
      ?.template ?? variant.fallback;
  const template = normalizeTemplate(raw, variant.tier);
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
    document,
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
    breakpoints: theme.breakpoints,
    editMode: LIVE_EDIT_MODE,
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
  if (!template.prefetchArchiveLoaders) return [];
  return data.entries.flatMap((e) => e.contentBlocks?.blocks ?? []);
}

interface ResolveDocumentArgs {
  readonly template: Template<TemplateData>;
  readonly document: DocumentManifest;
  readonly data: TemplateData;
  readonly ctx: AppContext;
  readonly deps: Record<string, Record<string, unknown>>;
}

// Merge the matched template's `document` fragment (a literal or a per-request
// function) onto the theme-wide document. No fragment → the theme document.
function resolveRenderDocument({
  template,
  document,
  data,
  ctx,
  deps,
}: ResolveDocumentArgs): DocumentManifest {
  const fragment = template.document;
  if (fragment === undefined) return document;
  const resolved =
    typeof fragment === "function"
      ? fragment({ ...deps, data, ctx })
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
  readonly template: Template<TemplateData>;
  readonly deps: Record<string, Record<string, unknown>>;
  readonly loaderData: ResolvedBlockLoaders | undefined;
  readonly tokens: ThemeTokens | undefined;
  readonly breakpoints: ThemeBreakpoints | undefined;
  readonly editMode: EditModeDecision;
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
  breakpoints,
  loaderData,
  editMode,
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
  const queriedEntryDetails =
    "entry" in data
      ? { type: data.entry.type, authorId: data.entry.authorId }
      : undefined;
  // Body shortcodes get the post-expansion entry — its `title` is already
  // rendered, not the raw `[year]` source the title pass itself expands.
  const entry =
    "entry" in data
      ? (data.entry as unknown as Readonly<Record<string, unknown>>)
      : null;
  // Bind once so the resolver closure keeps the non-null narrowing.
  const imageDelivery = ctx.imageDelivery;
  const templateTree: ReactNode = createElement(
    PlumixProvider,
    {
      value: {
        registry: ctx.blocks,
        mode: editMode.mode,
        tokens,
        breakpoints,
        loaderData,
        user: ctx.user,
        queriedEntry: ctx.resolvedEntity,
        locale: ctx.locale.code,
        shortcodes: ctx.shortcodes,
        entry,
        basePath: ctx.basePath,
        imageResolver: imageDelivery
          ? (src, opts) =>
              imageDelivery.url(src, {
                width: opts?.width,
                quality: opts?.quality,
                // blocks' resolver types `format` loosely as string.
                format: opts?.format as TransformOpts["format"],
              })
          : undefined,
        imageRemotePatterns: ctx.imageRemotePatterns,
      },
    },
    // Edit mode drops the front-end admin bar: redundant under the editor's
    // own toolbar, and its injected `body { padding-top }` ratchets the
    // auto-sized canvas iframe against the theme's `min-h-screen` into a
    // runaway height loop. Live/preview renders keep it.
    editMode.mode === "edit"
      ? null
      : createElement(PlumixAdminBar, {
          hooks: ctx.hooks,
          request: ctx.request,
          siteName: ctx.siteName ?? "Site",
          auth: ctx.auth,
          queriedEntryDetails,
          entryTypes: ctx.plugins.entryTypes,
        }),
    // Dev-only debug bar — standalone and auth-independent (unlike the admin
    // bar it never gates on a user). `process.env.PLUMIX_DEV` is Vite-empty
    // in prod builds, so this branch and the whole debug-bar module tree-shake
    // out. Dropped in edit mode alongside the admin bar.
    process.env.PLUMIX_DEV && editMode.mode !== "edit"
      ? createElement(PlumixDebugBar, { ctx })
      : null,
    createElement(TemplateAdapter),
  );
  const rendered = renderToString(templateTree);
  const { hoisted, body } = splitHoistedMetadata(rendered);

  const scripts = groupScriptsByPosition(document.script);

  const { code, direction } = ctx.locale;
  const htmlAttrs = renderAttrs({
    lang: code,
    dir: direction,
    ...document.html,
    // The island runtime reads this off <html> to decide whether to hydrate:
    // in edit mode islands stay static + selectable. Only stamped for the
    // editor render so ordinary pages keep clean markup (absent ⇒ hydrate).
    ...(editMode.mode === "edit" ? { "data-plumix-mode": editMode.mode } : {}),
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
  // `process.env.PLUMIX_DEV` is Vite-substituted at SSR-bundle time —
  // non-empty in `plumix dev`, empty in `plumix build`. The plumix Vite
  // plugin's `define` populates the literal.
  const command: ViteCommand = process.env.PLUMIX_DEV ? "serve" : "build";

  const headContent =
    scripts.headStart.map(scriptToHtml).join("") +
    '<meta charSet="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    hoisted +
    titleFallback +
    voidTagsToHtml("link", document.link) +
    bundledCssTags(assetManifest, command, ctx.basePath) +
    devThemeStylesTag(command, ctx.basePath) +
    voidTagsToHtml("meta", document.meta) +
    scripts.headEnd.map(scriptToHtml).join("");

  const withIslands = injectIslandsBootstrap(
    body,
    assetManifest,
    command,
    ctx.basePath,
  );
  const withRuntimes = injectEditorBootstrap(
    withIslands,
    editMode.injectRuntime,
    assetManifest,
    command,
    ctx.basePath,
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
