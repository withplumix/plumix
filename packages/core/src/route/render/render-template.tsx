import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { PlumixProvider } from "@plumix/blocks/renderer";

import type { AppContext } from "../../context/app.js";
import type {
  DocumentLink,
  DocumentMeta,
  DocumentScript,
  TemplateComponent,
  TemplateData,
  TemplateRegistry,
  ThemeDescriptor,
} from "../../theme.js";
import type { ErrorData } from "./resolved-entry.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import { resolveTemplateCandidates } from "./template-hierarchy.js";

interface RenderArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly node: ResolvedNode;
  readonly data: TemplateData;
  readonly title: string;
}

export async function renderThroughTheme({
  ctx,
  theme,
  node,
  data,
  title,
}: RenderArgs): Promise<string> {
  const candidates = await resolveTemplateCandidates(node, ctx.hooks);
  const Template = pickTemplate(theme.templates, candidates);
  return renderTree({ ctx, theme, data, title, Template });
}

interface RenderErrorArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
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

export function renderErrorThroughTheme({
  ctx,
  theme,
  kind,
  data,
}: RenderErrorArgs): string {
  const variant = ERROR_VARIANTS[kind];
  const Template = (theme.templates[variant.key] ??
    variant.fallback) as TemplateComponent<TemplateData>;
  return renderTree({ ctx, theme, data, title: variant.title, Template });
}

interface RenderTreeArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly data: TemplateData;
  readonly title: string;
  readonly Template: TemplateComponent<TemplateData>;
}

// React 19 reorders every child of `<head>` (metadata first, scripts /
// templates last), so we can't rely on JSX position to control where
// theme `script[]` lands. We render only the body subtree via React
// (capturing hoisted `<title>`/`<meta>`/`<link>`/`<script>` at the
// start of the output) and assemble the full document as a string
// template — Astro's approach for the same reason.
function renderTree({
  ctx,
  theme,
  data,
  title,
  Template,
}: RenderTreeArgs): string {
  const templateTree: ReactNode = createElement(PlumixProvider, {
    value: { registry: ctx.blocks },
    children: createElement(Template, { data }),
  });
  const rendered = renderToString(templateTree);
  const { hoisted, body } = splitHoistedMetadata(rendered);

  const manifest = theme.document;
  const scripts = groupScriptsByPosition(manifest?.script);

  const htmlAttrs = renderAttrs({ lang: "en", ...manifest?.html });
  const bodyAttrs = renderAttrs(manifest?.body);

  // A template-rendered `<title>` is part of `hoisted`. Browsers honor the
  // first `<title>` in document order, so emitting the framework default
  // first would shadow the template's choice — skip it in that case.
  const titleFallback = hoistedHasTitle(hoisted)
    ? ""
    : `<title>${escapeHtml(title)}</title>`;

  const headContent =
    scripts.headStart.map(scriptToHtml).join("") +
    '<meta charSet="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    hoisted +
    titleFallback +
    voidTagsToHtml("link", manifest?.link) +
    voidTagsToHtml("meta", manifest?.meta) +
    scripts.headEnd.map(scriptToHtml).join("");

  const bodyContent =
    scripts.bodyStart.map(scriptToHtml).join("") +
    body +
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
): TemplateComponent<TemplateData> {
  // The candidate list is derived from the route's kind, so the picked
  // template's narrowed data shape always matches the runtime `data`.
  // TS can't see that — widen with a cast at the boundary.
  for (const name of candidates) {
    const candidate = templates[name];
    if (candidate) return candidate as TemplateComponent<TemplateData>;
  }
  return templates.index;
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
