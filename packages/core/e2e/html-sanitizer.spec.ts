import type { Page } from "@playwright/test";

import type { HtmlAllowlist } from "@plumix/core/blocks";
import { BASELINE_HTML_ALLOWLIST } from "@plumix/core/blocks";
import { expect, test } from "@plumix/core/test/playwright";

declare global {
  interface Window {
    __plumixSanitize: (html: unknown, allowlist?: HtmlAllowlist) => string;
  }
}

interface SanitizerCase {
  readonly name: string;
  readonly input: unknown;
  /** `undefined` sanitizes against the baseline allowlist. */
  readonly allowlist: HtmlAllowlist | undefined;
  readonly expected: string;
}

/** The baseline plus `<img src>`, to put the URL policy on a second attribute. */
const WITH_IMG_SRC: HtmlAllowlist = {
  ...BASELINE_HTML_ALLOWLIST,
  allowedTags: [...BASELINE_HTML_ALLOWLIST.allowedTags, "img"],
  allowedAttributes: { img: ["src"] },
};

/**
 * Each runs the DOMPurify shim in a real page. The URL rows expect what
 * sanitize-html gives the same markup on the server.
 */
const CASES: readonly SanitizerCase[] = [
  {
    name: "strips <script> and its content",
    input: "<p>hi</p><script>alert(1)</script>",
    allowlist: undefined,
    expected: "<p>hi</p>",
  },
  {
    name: "strips a lone <script>",
    input: "<script>alert(1)</script>",
    allowlist: undefined,
    expected: "",
  },
  {
    name: "strips an on* handler from an anchor and keeps its href",
    input: '<a href="/x" onmouseover="evil()">x</a>',
    allowlist: undefined,
    expected: '<a href="/x">x</a>',
  },
  {
    name: "strips an on* handler from a paragraph",
    input: '<p onclick="alert(1)">hi</p>',
    allowlist: undefined,
    expected: "<p>hi</p>",
  },
  {
    name: "strips a javascript: href",
    input: '<a href="javascript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "strips a data: href",
    input: '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "strips a case-obfuscated javascript: href",
    input: '<a href="JaVaScRiPt:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "strips a tab-obfuscated javascript: href",
    input: '<a href="java\tscript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "strips an entity-obfuscated javascript: href",
    input: '<a href="javas&#99;ript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "strips a space-led javascript: href",
    input: '<a href=" javascript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "strips a protocol-relative href",
    input: '<a href="//evil.example/x">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: "keeps a root-relative href",
    input: '<a href="/internal">x</a>',
    allowlist: undefined,
    expected: '<a href="/internal">x</a>',
  },
  {
    name: "keeps a fragment href",
    input: '<a href="#section">x</a>',
    allowlist: undefined,
    expected: '<a href="#section">x</a>',
  },
  {
    name: "keeps a query-only href",
    input: '<a href="?page=2">x</a>',
    allowlist: undefined,
    expected: '<a href="?page=2">x</a>',
  },
  {
    name: "strips target and rel from an anchor",
    input: '<a href="https://x.example" target="_blank" rel="opener">x</a>',
    allowlist: undefined,
    expected: '<a href="https://x.example">x</a>',
  },
  {
    name: "strips an attribute allowed only on another tag",
    input: '<span href="https://evil.example">x</span>',
    allowlist: undefined,
    expected: "<span>x</span>",
  },
  {
    name: "strips data-* from a span",
    input: '<span data-onclick="alert(1)" data-controller="evil">x</span>',
    allowlist: undefined,
    expected: "<span>x</span>",
  },
  {
    name: "strips an <iframe>",
    input: '<iframe src="//evil"></iframe>hi',
    allowlist: undefined,
    expected: "hi",
  },
  {
    name: "strips an <object>",
    input: '<object data="//evil"></object>hi',
    allowlist: undefined,
    expected: "hi",
  },
  {
    name: "strips an <embed>",
    input: '<embed src="//evil">hi',
    allowlist: undefined,
    expected: "hi",
  },
  {
    name: "strips an <svg> and the <script> inside it",
    input: "<svg><script>alert(1)</script></svg>hi",
    allowlist: undefined,
    expected: "hi",
  },
  {
    name: "strips a <math> and its javascript: href",
    input: '<math><mglyph href="javascript:alert(1)">x</mglyph></math>hi',
    allowlist: undefined,
    expected: "hi",
  },
  {
    name: "keeps an h1",
    input: "<h1>title</h1>",
    allowlist: undefined,
    expected: "<h1>title</h1>",
  },
  {
    name: "keeps an h2",
    input: "<h2>title</h2>",
    allowlist: undefined,
    expected: "<h2>title</h2>",
  },
  {
    name: "keeps an h3",
    input: "<h3>title</h3>",
    allowlist: undefined,
    expected: "<h3>title</h3>",
  },
  {
    name: "keeps an h4",
    input: "<h4>title</h4>",
    allowlist: undefined,
    expected: "<h4>title</h4>",
  },
  {
    name: "keeps an h5",
    input: "<h5>title</h5>",
    allowlist: undefined,
    expected: "<h5>title</h5>",
  },
  {
    name: "keeps an h6",
    input: "<h6>title</h6>",
    allowlist: undefined,
    expected: "<h6>title</h6>",
  },
  {
    name: "strips a <style> block and its content",
    input: "<style>body { background: url(javascript:alert(1)) }</style>hi",
    allowlist: undefined,
    expected: "hi",
  },
  {
    name: "keeps safe formatting, heading and list structure",
    input:
      '<h2>Title</h2><p><strong>Bold</strong> <em>i</em> <a href="https://example.com">l</a></p><ul><li>one</li></ul>',
    allowlist: undefined,
    expected:
      '<h2>Title</h2><p><strong>Bold</strong> <em>i</em> <a href="https://example.com">l</a></p><ul><li>one</li></ul>',
  },
  {
    name: "returns empty for undefined",
    input: undefined,
    allowlist: undefined,
    expected: "",
  },
  {
    name: "returns empty for null",
    input: null,
    allowlist: undefined,
    expected: "",
  },
  {
    name: "returns empty for a number",
    input: 42,
    allowlist: undefined,
    expected: "",
  },
  {
    name: "returns empty for an empty string",
    input: "",
    allowlist: undefined,
    expected: "",
  },
  {
    name: "drops an override's javascript scheme",
    input: '<a href="javascript:alert(1)">x</a>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedSchemes: ["https", "javascript"],
    },
    expected: "<a>x</a>",
  },
  {
    name: "drops an override's JavaScript scheme",
    input: '<a href="javascript:alert(1)">x</a>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedSchemes: ["https", "JavaScript"],
    },
    expected: "<a>x</a>",
  },
  {
    name: "drops an override's JAVASCRIPT scheme",
    input: '<a href="javascript:alert(1)">x</a>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedSchemes: ["https", "JAVASCRIPT"],
    },
    expected: "<a>x</a>",
  },
  {
    name: "drops an override's view-source wrapper",
    input: '<a href="view-source:javascript:alert(1)">x</a>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedSchemes: ["https", "view-source"],
    },
    expected: "<a>x</a>",
  },
  {
    name: "drops an override's onclick attribute",
    input: '<p onclick="alert(1)">x</p>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedAttributes: { p: ["onclick"] },
    },
    expected: "<p>x</p>",
  },
  {
    name: "drops an override's ONCLICK attribute",
    input: '<p onclick="alert(1)">x</p>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedAttributes: { p: ["ONCLICK"] },
    },
    expected: "<p>x</p>",
  },
  {
    name: "drops an override's OnClick attribute",
    input: '<p onclick="alert(1)">x</p>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedAttributes: { p: ["OnClick"] },
    },
    expected: "<p>x</p>",
  },
  {
    name: "drops an override's style attribute",
    input: '<p style="background:url(x)">x</p>',
    allowlist: {
      ...BASELINE_HTML_ALLOWLIST,
      allowedAttributes: { p: ["style"] },
    },
    expected: "<p>x</p>",
  },
  {
    name: "floors a hand-built allowlist naming SCRIPT, IFRAME and ONCLICK",
    input: '<p onclick="alert(1)">hi</p><script>x</script>',
    allowlist: {
      allowedTags: ["p", "SCRIPT", "IFRAME"],
      allowedAttributes: { p: ["ONCLICK"] },
      allowedSchemes: ["https"],
    },
    expected: "<p>hi</p>",
  },
  {
    name: 'keeps the href "https://example.com/a" as sanitize-html does',
    input: '<a href="https://example.com/a">x</a>',
    allowlist: undefined,
    expected: '<a href="https://example.com/a">x</a>',
  },
  {
    name: 'keeps the href "HTTP://example.com" as sanitize-html does',
    input: '<a href="HTTP://example.com">x</a>',
    allowlist: undefined,
    expected: '<a href="HTTP://example.com">x</a>',
  },
  {
    name: 'keeps the href "mailto:a@example.com" as sanitize-html does',
    input: '<a href="mailto:a@example.com">x</a>',
    allowlist: undefined,
    expected: '<a href="mailto:a@example.com">x</a>',
  },
  {
    name: 'keeps the href "tel:+100" as sanitize-html does',
    input: '<a href="tel:+100">x</a>',
    allowlist: undefined,
    expected: '<a href="tel:+100">x</a>',
  },
  {
    name: 'keeps the href "/root" as sanitize-html does',
    input: '<a href="/root">x</a>',
    allowlist: undefined,
    expected: '<a href="/root">x</a>',
  },
  {
    name: 'keeps the href "#fragment" as sanitize-html does',
    input: '<a href="#fragment">x</a>',
    allowlist: undefined,
    expected: '<a href="#fragment">x</a>',
  },
  {
    name: 'keeps the href "?query=1" as sanitize-html does',
    input: '<a href="?query=1">x</a>',
    allowlist: undefined,
    expected: '<a href="?query=1">x</a>',
  },
  {
    name: 'keeps the href "./sibling" as sanitize-html does',
    input: '<a href="./sibling">x</a>',
    allowlist: undefined,
    expected: '<a href="./sibling">x</a>',
  },
  {
    name: 'keeps the href "../parent" as sanitize-html does',
    input: '<a href="../parent">x</a>',
    allowlist: undefined,
    expected: '<a href="../parent">x</a>',
  },
  {
    name: 'keeps the href "plain/relative" as sanitize-html does',
    input: '<a href="plain/relative">x</a>',
    allowlist: undefined,
    expected: '<a href="plain/relative">x</a>',
  },
  {
    name: 'drops the href "//evil.example/x" as sanitize-html does',
    input: '<a href="//evil.example/x">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "javascript:alert(1)" as sanitize-html does',
    input: '<a href="javascript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "JaVaScRiPt:alert(1)" as sanitize-html does',
    input: '<a href="JaVaScRiPt:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "java\\tscript:alert(1)" as sanitize-html does',
    input: '<a href="java\tscript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href " javascript:alert(1)" as sanitize-html does',
    input: '<a href=" javascript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "data:text/html,x" as sanitize-html does',
    input: '<a href="data:text/html,x">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "vbscript:x" as sanitize-html does',
    input: '<a href="vbscript:x">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "ftp://example.com" as sanitize-html does',
    input: '<a href="ftp://example.com">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "view-source:https://example.com" as sanitize-html does',
    input: '<a href="view-source:https://example.com">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "&#106;avascript:alert(1)" as sanitize-html does',
    input: '<a href="&#106;avascript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "javascript&colon;alert(1)" as sanitize-html does',
    input: '<a href="javascript&colon;alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'drops the href "\\u0001javascript:alert(1)" as sanitize-html does',
    input: '<a href="\u0001javascript:alert(1)">x</a>',
    allowlist: undefined,
    expected: "<a>x</a>",
  },
  {
    name: 'keeps the href "https:" as sanitize-html does',
    input: '<a href="https:">x</a>',
    allowlist: undefined,
    expected: '<a href="https:">x</a>',
  },
  {
    name: 'keeps the href "mailto:" as sanitize-html does',
    input: '<a href="mailto:">x</a>',
    allowlist: undefined,
    expected: '<a href="mailto:">x</a>',
  },
  {
    name: 'keeps the img src "https://example.com/a" as sanitize-html does',
    input: '<img src="https://example.com/a">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="https://example.com/a">',
  },
  {
    name: 'keeps the img src "HTTP://example.com" as sanitize-html does',
    input: '<img src="HTTP://example.com">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="HTTP://example.com">',
  },
  {
    name: 'keeps the img src "mailto:a@example.com" as sanitize-html does',
    input: '<img src="mailto:a@example.com">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="mailto:a@example.com">',
  },
  {
    name: 'keeps the img src "tel:+100" as sanitize-html does',
    input: '<img src="tel:+100">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="tel:+100">',
  },
  {
    name: 'keeps the img src "/root" as sanitize-html does',
    input: '<img src="/root">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="/root">',
  },
  {
    name: 'keeps the img src "#fragment" as sanitize-html does',
    input: '<img src="#fragment">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="#fragment">',
  },
  {
    name: 'keeps the img src "?query=1" as sanitize-html does',
    input: '<img src="?query=1">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="?query=1">',
  },
  {
    name: 'keeps the img src "./sibling" as sanitize-html does',
    input: '<img src="./sibling">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="./sibling">',
  },
  {
    name: 'keeps the img src "../parent" as sanitize-html does',
    input: '<img src="../parent">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="../parent">',
  },
  {
    name: 'keeps the img src "plain/relative" as sanitize-html does',
    input: '<img src="plain/relative">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="plain/relative">',
  },
  {
    name: 'drops the img src "//evil.example/x" as sanitize-html does',
    input: '<img src="//evil.example/x">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "javascript:alert(1)" as sanitize-html does',
    input: '<img src="javascript:alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "JaVaScRiPt:alert(1)" as sanitize-html does',
    input: '<img src="JaVaScRiPt:alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "java\\tscript:alert(1)" as sanitize-html does',
    input: '<img src="java\tscript:alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src " javascript:alert(1)" as sanitize-html does',
    input: '<img src=" javascript:alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "data:text/html,x" as sanitize-html does',
    input: '<img src="data:text/html,x">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "vbscript:x" as sanitize-html does',
    input: '<img src="vbscript:x">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "ftp://example.com" as sanitize-html does',
    input: '<img src="ftp://example.com">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "view-source:https://example.com" as sanitize-html does',
    input: '<img src="view-source:https://example.com">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "&#106;avascript:alert(1)" as sanitize-html does',
    input: '<img src="&#106;avascript:alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "javascript&colon;alert(1)" as sanitize-html does',
    input: '<img src="javascript&colon;alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'drops the img src "\\u0001javascript:alert(1)" as sanitize-html does',
    input: '<img src="\u0001javascript:alert(1)">',
    allowlist: WITH_IMG_SRC,
    expected: "<img>",
  },
  {
    name: 'keeps the img src "https:" as sanitize-html does',
    input: '<img src="https:">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="https:">',
  },
  {
    name: 'keeps the img src "mailto:" as sanitize-html does',
    input: '<img src="mailto:">',
    allowlist: WITH_IMG_SRC,
    expected: '<img src="mailto:">',
  },
];

/** Loads the page whose island hands the bundle's `sanitizeHtml` to `window`. */
async function openSanitizer(page: Page): Promise<void> {
  await page.goto("/sanitizer");
  await expect(page.getByTestId("sanitize-probe")).toHaveAttribute(
    "data-ready",
  );
}

test("the browser bundle sanitizes with the DOMPurify shim", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));

  await openSanitizer(page);

  const shimRequests = requested.filter((url) =>
    url.includes("/dompurify-shim.js"),
  );
  const sanitizeHtmlRequests = requested.filter((url) =>
    url.includes("sanitize-html"),
  );
  expect(shimRequests).not.toEqual([]);
  expect(sanitizeHtmlRequests).toEqual([]);
});

for (const { name, input, allowlist, expected } of CASES) {
  test(`the browser sanitizer ${name}`, async ({ page }) => {
    await openSanitizer(page);

    const output = await page.evaluate(
      ([html, list]) => window.__plumixSanitize(html, list),
      [input, allowlist] as const,
    );

    expect(output).toBe(expected);
  });
}
