import { PlumixProvider } from "@plumix/blocks/renderer";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { AppContext } from "../../context/app.js";
import type { ThemeDescriptor } from "../../theme.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import { resolveTemplateCandidates } from "./template-hierarchy.js";

interface RenderSingleArgs {
  readonly ctx: AppContext;
  readonly theme: ThemeDescriptor;
  readonly node: ResolvedNode;
  readonly data: { readonly entry: { readonly title: string } };
}

export async function renderThroughTheme({
  ctx,
  theme,
  node,
  data,
}: RenderSingleArgs): Promise<string> {
  const candidates = await resolveTemplateCandidates(node, ctx.hooks);
  const matched = candidates.find((name) => theme.templates[name]);
  const Template = matched
    ? theme.templates[matched]!
    : theme.templates.index;

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
