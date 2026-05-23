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
import type { ResolvedNode } from "./template-hierarchy.js";
import { resolveTemplateCandidates } from "./template-hierarchy.js";

interface RenderSingleArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly node: ResolvedNode;
  readonly data: TemplateData;
}

export async function renderThroughTheme({
  ctx,
  theme,
  node,
  data,
}: RenderSingleArgs): Promise<string> {
  const candidates = await resolveTemplateCandidates(node, ctx.hooks);
  const Template = pickTemplate(theme.templates, candidates);

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
        title: data.entry.title,
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
