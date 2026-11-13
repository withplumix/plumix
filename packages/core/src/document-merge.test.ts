import { describe, expect, expectTypeOf, test } from "vitest";

import type { DocumentManifest } from "./document-manifest.js";
import { mergeDocumentManifest } from "./document-merge.js";

describe("mergeDocumentManifest", () => {
  test("concats theme link[] then template link[]", () => {
    const merged = mergeDocumentManifest(
      { link: [{ rel: "icon", href: "/favicon.svg" }] },
      { link: [{ rel: "stylesheet", href: "/single.css" }] },
    );
    expect(merged.link).toEqual([
      { rel: "icon", href: "/favicon.svg" },
      { rel: "stylesheet", href: "/single.css" },
    ]);
  });

  test("concats meta[] in theme-then-template order", () => {
    const merged = mergeDocumentManifest(
      { meta: [{ name: "description", content: "Site" }] },
      { meta: [{ name: "robots", content: "noindex" }] },
    );
    expect(merged.meta).toEqual([
      { name: "description", content: "Site" },
      { name: "robots", content: "noindex" },
    ]);
  });

  test("concats script[] in theme-then-template order", () => {
    const merged = mergeDocumentManifest(
      { script: [{ src: "https://theme.example/a.js" }] },
      { script: [{ src: "https://single.example/b.js", position: "headEnd" }] },
    );
    expect(merged.script).toEqual([
      { src: "https://theme.example/a.js" },
      { src: "https://single.example/b.js", position: "headEnd" },
    ]);
  });

  test("theme-only merge (no template fragment) preserves theme arrays", () => {
    const theme = {
      link: [{ rel: "icon", href: "/x.svg" }],
      meta: [{ name: "description", content: "Site" }],
    };
    const merged = mergeDocumentManifest(theme, undefined);
    expect(merged.link).toEqual(theme.link);
    expect(merged.meta).toEqual(theme.meta);
  });

  test("html.className concatenates theme + template with a space separator", () => {
    const merged = mergeDocumentManifest(
      { html: { lang: "en", className: "theme" } },
      { html: { className: "single-variant" } },
    );
    expect(merged.html).toEqual({
      lang: "en",
      className: "theme single-variant",
    });
  });

  test("body.className also concatenates", () => {
    const merged = mergeDocumentManifest(
      { body: { className: "font-sans" } },
      { body: { className: "post-page" } },
    );
    expect(merged.body).toEqual({ className: "font-sans post-page" });
  });

  test("template scalar html/body fields override theme (last-wins)", () => {
    const merged = mergeDocumentManifest(
      { html: { lang: "en", dir: "ltr" } },
      { html: { lang: "fr" } },
    );
    expect(merged.html).toEqual({ lang: "fr", dir: "ltr" });
  });

  test("empty theme + template fragment surfaces the template's entries", () => {
    const merged = mergeDocumentManifest(
      {},
      { link: [{ rel: "preconnect", href: "https://cdn.example" }] },
    );
    expect(merged.link).toEqual([
      { rel: "preconnect", href: "https://cdn.example" },
    ]);
  });

  test("a template's canonical: false wins over a theme that set none", () => {
    expect(mergeDocumentManifest({}, { canonical: false }).canonical).toBe(
      false,
    );
  });

  test("canonical accepts only false, so a template cannot re-enable it", () => {
    expectTypeOf<DocumentManifest["canonical"]>().toEqualTypeOf<
      false | undefined
    >();
  });

  test("viewport merges field by field, the fragment winning", () => {
    const merged = mergeDocumentManifest(
      { viewport: { viewportFit: "cover", initialScale: 1 } },
      { viewport: { interactiveWidget: "resizes-content", initialScale: 2 } },
    );
    expect(merged.viewport).toEqual({
      viewportFit: "cover",
      initialScale: 2,
      interactiveWidget: "resizes-content",
    });
  });

  test("a viewport themeColor list is replaced whole, not concatenated", () => {
    const merged = mergeDocumentManifest(
      {
        viewport: {
          themeColor: [
            { color: "#fff", media: "(prefers-color-scheme: light)" },
            { color: "#000", media: "(prefers-color-scheme: dark)" },
          ],
        },
      },
      { viewport: { themeColor: [{ color: "#f00" }] } },
    );
    expect(merged.viewport?.themeColor).toEqual([{ color: "#f00" }]);
  });

  test("a viewport field set to undefined keeps the earlier value", () => {
    const merged = mergeDocumentManifest(
      { viewport: { viewportFit: "cover", colorScheme: "light dark" } },
      { viewport: { viewportFit: undefined, colorScheme: "dark" } },
    );
    expect(merged.viewport).toEqual({
      viewportFit: "cover",
      colorScheme: "dark",
    });
  });

  test("viewport stays absent when neither side sets it", () => {
    expect(mergeDocumentManifest({}, {}).viewport).toBeUndefined();
  });
});
