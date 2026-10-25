import { describe, expectTypeOf, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { DocumentManifest } from "../document-manifest.js";
import type { EntryQuery } from "../entries/contract/query.js";
import type { EntryData } from "../route/contract/resolved-entry.js";
import type { TemplateData } from "../theme.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createPluginSetupContext } from "../plugin/setup-context.js";
import { HookRegistry } from "./registry.js";
import { render } from "./render.js";

const ctx = createPluginSetupContext({
  pluginId: "acme",
  hooks: new HookRegistry(),
  registry: createPluginRegistry(),
  theme: { templates: [] },
});

describe("render", () => {
  test("a document handler is handed the manifest, the page's data and title, and the ctx", () => {
    ctx.filters.add(render.document, (manifest, input, handlerCtx) => {
      expectTypeOf(manifest).toEqualTypeOf<DocumentManifest>();
      expectTypeOf(input.data).toEqualTypeOf<TemplateData>();
      expectTypeOf(input.title).toEqualTypeOf<string>();
      expectTypeOf(handlerCtx).toEqualTypeOf<AppContext>();
      return manifest;
    });
  });

  test("a page-data handler may return a promise", () => {
    ctx.filters.add(render.single, (data) => {
      expectTypeOf(data).toEqualTypeOf<EntryData>();
      return Promise.resolve(data);
    });
  });

  test("an archive-entries handler returns the query, and can't return a promise", () => {
    ctx.filters.add(render.archiveEntries, (query, { archive, params }) => {
      expectTypeOf(query).toEqualTypeOf<EntryQuery>();
      expectTypeOf(archive.kind).not.toEqualTypeOf<
        "entry" | "search" | "view"
      >();
      expectTypeOf(params).toEqualTypeOf<Readonly<Record<string, string>>>();
      return query;
    });
    // @ts-expect-error a sync filter's handler can't return a promise
    ctx.filters.add(render.archiveEntries, (query) => Promise.resolve(query));
  });

  test("a document filter can't be passed to events.on", () => {
    // @ts-expect-error a filter is not an event
    ctx.events.on(render.document, () => undefined);
  });
});
