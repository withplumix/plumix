import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ShortcodeSpec } from "@plumix/core/blocks";
import {
  BASELINE_HTML_ALLOWLIST,
  coreBlocks,
  coreShortcodes,
  createBlockRegistry,
  defineShortcode,
} from "@plumix/core/blocks";
import { BlockRenderer, PlumixProvider } from "@plumix/core/blocks/renderer";

import { parseCanvasSeed } from "./canvas-seed.js";
import { EditorCanvas } from "./editor-canvas.js";

const registry = createBlockRegistry(coreBlocks);
const ORIGIN = "http://localhost:3000";

/** What the SSR embeds in the content root for a tree of `blocks`. */
const treeEmbed = (blocks: readonly unknown[]): string =>
  JSON.stringify({ version: "plumix.v2", blocks });

describe("EditorCanvas", () => {
  describe("the canvas renders a shortcode as the server's edit-mode render does", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-06-01T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const shortcodes = new Map<string, ShortcodeSpec>(
      [
        ...coreShortcodes,
        defineShortcode({
          name: "price",
          render: ({ context }) =>
            new Intl.NumberFormat(context.locale).format(1234.5),
        }),
        defineShortcode({
          name: "headline",
          render: ({ context }) => {
            const headline = context.entry?.headline;
            return typeof headline === "string" ? headline : "";
          },
        }),
        defineShortcode({
          name: "site-title",
          render: ({ context }) => {
            const title = context.siteSettings.title;
            return typeof title === "string" ? title : "";
          },
        }),
      ].map((spec) => [spec.name, spec]),
    );

    // The page's server render, then the canvas mounted over it from the same
    // embeds: the author must not watch the text flip.
    function serverThenCanvas(body: string): [string, string] {
      const blocks = [{ id: "e1", name: "core/rich-text", attrs: { body } }];
      const env = {
        locale: "de",
        entry: { headline: "Sommer" },
        deps: { settings: { site: { title: "Acme" } } },
      };
      const server = renderToStaticMarkup(
        <PlumixProvider value={{ registry, mode: "edit", shortcodes, ...env }}>
          <BlockRenderer content={{ version: "plumix.v2", blocks }} />
        </PlumixProvider>,
      );
      const canvas = renderToStaticMarkup(
        <EditorCanvas
          {...parseCanvasSeed({
            initialTree: treeEmbed(blocks),
            renderEnv: JSON.stringify(env),
            loaderData: "",
          })}
          registry={registry}
          shortcodes={shortcodes}
          origin={ORIGIN}
        />,
      );
      return [blockMarkup(server), blockMarkup(canvas)];
    }

    // The block's own element, whatever the content root around it carries.
    function blockMarkup(html: string): string | undefined {
      return /<div data-plumix-block="core\/rich-text" data-plumix-id="e1">.*?<\/div><\/div>/s.exec(
        html,
      )?.[0];
    }

    test.each([
      ["[year]", "<p>© [year]</p>", "<p>© 2031</p>"],
      ["the page's locale", "<p>[price]</p>", "<p>1.234,5</p>"],
      ["a field off the queried entry", "<p>[headline]</p>", "<p>Sommer</p>"],
      ["the site's settings", "<p>[site-title]</p>", "<p>Acme</p>"],
    ])("%s", (_, body, rendered) => {
      const [server, canvas] = serverThenCanvas(body);

      expect(server).toBe(
        `<div data-plumix-block="core/rich-text" data-plumix-id="e1"><div>${rendered}</div></div>`,
      );
      expect(canvas).toBe(server);
    });
  });

  test("renders the initial tree before any host push", () => {
    const html = renderToStaticMarkup(
      <EditorCanvas
        registry={registry}
        origin={ORIGIN}
        initialTree={[
          {
            id: "seed",
            name: "core/rich-text",
            attrs: { body: "<h2>Seeded</h2>" },
          },
        ]}
      />,
    );

    expect(html).toContain('data-plumix-id="seed"');
    expect(html).toContain("<h2>Seeded</h2>");
  });

  test("emits a block's style as CSS when tokens are provided", () => {
    const html = renderToStaticMarkup(
      <EditorCanvas
        registry={registry}
        origin={ORIGIN}
        tokens={{ colors: { brand: { value: "#0000ff" } } }}
        initialTree={[
          {
            id: "h1",
            name: "core/rich-text",
            attrs: { body: "<h2>Hi</h2>" },
            style: { large: { color: "#ff0000" } },
          },
        ]}
      />,
    );

    expect(html).toMatch(/\.plumix-block-h1\s*\{[^}]*color:\s*#ff0000/);
  });

  describe("seeded from the page's embeds", () => {
    function canvasFrom(
      blocks: readonly unknown[],
      renderEnv: unknown,
    ): ReactElement {
      return (
        <EditorCanvas
          {...parseCanvasSeed({
            initialTree: treeEmbed(blocks),
            renderEnv: JSON.stringify(renderEnv),
            loaderData: "",
          })}
          registry={registry}
          origin={ORIGIN}
        />
      );
    }

    test("paints a block's style with the embedded render env", () => {
      const html = renderToStaticMarkup(
        canvasFrom(
          [
            {
              id: "e1",
              name: "core/rich-text",
              attrs: { body: "<h2>Styled</h2>" },
              style: { medium: { color: "#ff0000" } },
            },
          ],
          {
            tokens: { colors: { brand: { value: "#0000ff" } } },
            breakpoints: { tablet: 900, mobile: 640 },
          },
        ),
      );

      expect(html).toMatch(
        /@media \(max-width: 900px\)\s*\{\s*\.plumix-block-e1\s*\{[^}]*color:\s*#ff0000/,
      );
    });

    test("sanitizes html against the embedded allowlist, not the baseline", () => {
      const html = renderToStaticMarkup(
        canvasFrom(
          [
            {
              id: "e1",
              name: "core/html",
              attrs: { html: '<p><img src="/cat.png"></p>' },
            },
          ],
          {
            htmlAllowlist: {
              allowedTags: [...BASELINE_HTML_ALLOWLIST.allowedTags, "img"],
              allowedAttributes: {
                ...BASELINE_HTML_ALLOWLIST.allowedAttributes,
                img: ["src"],
              },
            },
          },
        ),
      );

      expect(html).toContain('<img src="/cat.png"');
    });

    test("falls back to the baseline allowlist when the render env carries none", () => {
      const html = renderToStaticMarkup(
        canvasFrom(
          [
            {
              id: "e1",
              name: "core/html",
              attrs: { html: '<p><img src="/cat.png"></p>' },
            },
          ],
          {},
        ),
      );

      expect(html).not.toContain("<img");
    });
  });
});
