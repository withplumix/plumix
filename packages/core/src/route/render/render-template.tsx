import type { ReactNode } from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { PlumixProvider } from "@plumix/blocks/renderer";

import type { AppContext } from "../../context/app.js";
import type {
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
  const Template = theme.templates[variant.key] ?? variant.fallback;
  return renderTree({ ctx, theme, data, title: variant.title, Template });
}

interface RenderTreeArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly data: TemplateData;
  readonly title: string;
  readonly Template: TemplateComponent<TemplateData>;
}

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

  const Document = theme.document;
  const documentTree = Document
    ? createElement(Document, {
        data,
        request: ctx.request,
        children: templateTree,
      })
    : createElement(DefaultDocument, {
        title,
        children: templateTree,
      });

  return "<!doctype html>" + renderToString(documentTree);
}

function pickTemplate(
  templates: TemplateRegistry,
  candidates: readonly string[],
): TemplateComponent<TemplateData> {
  for (const name of candidates) {
    const candidate = templates[name];
    if (candidate) return candidate;
  }
  return templates.index;
}

function DefaultDocument({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  );
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
