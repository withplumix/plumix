/**
 * @vitest-environment jsdom
 *
 * Integration coverage: every shipped core mark renders correctly
 * when dispatched through the registry that `buildApp` actually
 * produces (not a hand-built `mockMarkRegistry`). This is the test
 * that would have surfaced the foundation-slice `code` vs
 * `code-inline` name mismatch — assert against `app.marks` directly.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockContext, TiptapNode } from "@plumix/blocks";
import { coreBlocks, EntryContent, paragraphBlock } from "@plumix/blocks";
import { mockRegistry } from "@plumix/blocks/test";

import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { buildApp } from "./runtime/app.js";

const baseConfig = {
  runtime: {
    name: "test",
    buildFetchHandler: () => () => new Response("stub", { status: 500 }),
  },
  database: {
    kind: "test",
    connect: () => ({ db: {} }),
  },
  auth: auth({
    passkey: {
      rpName: "Plumix Test",
      rpId: "cms.example",
      origin: "https://cms.example",
    },
  }),
};

const EMPTY_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
};

function docWithMarkedText(
  markType: string,
  attrs?: Record<string, unknown>,
): TiptapNode {
  return {
    type: "doc",
    content: [
      {
        type: "core/paragraph",
        content: [
          {
            type: "text",
            text: "Hi",
            marks: [{ type: markType, attrs }],
          },
        ],
      },
    ],
  };
}

describe("buildApp().marks renders every shipped mark on real docs", () => {
  test.each([
    { mark: "bold", expected: "<p><strong>Hi</strong></p>" },
    { mark: "italic", expected: "<p><em>Hi</em></p>" },
    { mark: "strike", expected: "<p><s>Hi</s></p>" },
    { mark: "code", expected: "<p><code>Hi</code></p>" },
    { mark: "underline", expected: "<p><u>Hi</u></p>" },
    { mark: "subscript", expected: "<p><sub>Hi</sub></p>" },
    { mark: "superscript", expected: "<p><sup>Hi</sup></p>" },
    { mark: "highlight", expected: "<p><mark>Hi</mark></p>" },
    { mark: "kbd", expected: "<p><kbd>Hi</kbd></p>" },
    { mark: "cite", expected: "<p><cite>Hi</cite></p>" },
    { mark: "small", expected: "<p><small>Hi</small></p>" },
  ])("$mark renders to $expected via app.marks", async ({ mark, expected }) => {
    const app = await buildApp(plumix(baseConfig));
    const blockRegistry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderToStaticMarkup(
      EntryContent({
        content: docWithMarkedText(mark),
        registry: blockRegistry,
        markRegistry: app.marks,
        context: EMPTY_CONTEXT,
      }),
    );
    expect(html).toBe(expected);
  });

  test("link renders a safe anchor via app.marks", async () => {
    const app = await buildApp(plumix(baseConfig));
    const blockRegistry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderToStaticMarkup(
      EntryContent({
        content: docWithMarkedText("link", { href: "https://example.com" }),
        registry: blockRegistry,
        markRegistry: app.marks,
        context: EMPTY_CONTEXT,
      }),
    );
    expect(html).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer nofollow">Hi</a></p>',
    );
  });

  test("abbr renders with title attribute via app.marks", async () => {
    const app = await buildApp(plumix(baseConfig));
    const blockRegistry = await mockRegistry({ core: [paragraphBlock] });
    const html = renderToStaticMarkup(
      EntryContent({
        content: docWithMarkedText("abbr", { title: "HyperText" }),
        registry: blockRegistry,
        markRegistry: app.marks,
        context: EMPTY_CONTEXT,
      }),
    );
    expect(html).toBe('<p><abbr title="HyperText">Hi</abbr></p>');
  });

  test("app.marks covers all 13 shipped core marks", async () => {
    const app = await buildApp(plumix(baseConfig));
    const expected = [
      "bold",
      "italic",
      "strike",
      "code",
      "link",
      "underline",
      "subscript",
      "superscript",
      "highlight",
      "kbd",
      "abbr",
      "cite",
      "small",
    ];
    for (const name of expected) {
      expect(app.marks.has(name), `mark "${name}" missing`).toBe(true);
    }
    expect(app.marks.size).toBe(coreMarksCount());
  });
});

function coreMarksCount(): number {
  // Source-of-truth for the count lives in coreBlocks adjacent file; the
  // assertion above intentionally hardcodes the list to surface accidental
  // additions/removals as a test edit, not a silent change.
  void coreBlocks;
  return 13;
}
