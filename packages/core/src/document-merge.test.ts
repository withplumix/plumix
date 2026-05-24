import { describe, expect, test } from "vitest";

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
      { meta: [{ name: "theme-color", content: "#fff" }] },
      { meta: [{ name: "robots", content: "noindex" }] },
    );
    expect(merged.meta).toEqual([
      { name: "theme-color", content: "#fff" },
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
      meta: [{ name: "theme-color", content: "#000" }],
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
});
