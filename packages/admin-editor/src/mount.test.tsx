import { act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test } from "vitest";

import type { EntryContent, ShortcodeSpec } from "@plumix/blocks";
import {
  BASELINE_HTML_ALLOWLIST,
  coreBlocks,
  coreShortcodes,
  createBlockRegistry,
  defineShortcode,
} from "@plumix/blocks";
import { BlockRenderer, PlumixProvider } from "@plumix/blocks/renderer";

import { mountEditorRuntime } from "./mount.js";

const registry = createBlockRegistry(coreBlocks);

// What the SSR does to its own embeds: an authored `</script>` would otherwise
// close the tag that carries it.
const embed = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountEditorRuntime", () => {
  describe("renders what the server edit-mode render shows", () => {
    const price = defineShortcode({
      name: "price",
      render: ({ context }) =>
        new Intl.NumberFormat(context.locale).format(1234.5),
    });
    const headline = defineShortcode({
      name: "headline",
      render: ({ context }) => {
        const headline = context.entry?.headline;
        return typeof headline === "string" ? headline : "";
      },
    });
    const shortcodes = new Map<string, ShortcodeSpec>(
      [...coreShortcodes, price, headline].map((spec) => [spec.name, spec]),
    );

    // Server-render the page in edit mode, then mount the canvas over it and
    // read the same block back — the author must not watch the text flip.
    const serverThenCanvas = (body: string): [string, string] => {
      const content: EntryContent = {
        version: "plumix.v2",
        blocks: [{ id: "e1", name: "core/rich-text", attrs: { body } }],
      };
      document.body.innerHTML = renderToStaticMarkup(
        <PlumixProvider
          value={{
            registry,
            mode: "edit",
            locale: "de",
            shortcodes,
            entry: { headline: "Sommer" },
          }}
        >
          <BlockRenderer content={content} />
        </PlumixProvider>,
      );
      const read = (): string =>
        document.querySelector('[data-plumix-id="e1"]')?.textContent ?? "";
      const server = read();
      act(() => {
        mountEditorRuntime({
          doc: document,
          registry,
          shortcodes,
          origin: "http://localhost",
        });
      });
      return [server, read()];
    };

    test("expands a [year] rich-text body the way the server does", () => {
      const [server, canvas] = serverThenCanvas("<p>© [year]</p>");
      expect(server).toBe(`© ${new Date().getFullYear()}`);
      expect(canvas).toBe(server);
    });

    test("formats with the page's locale, not the en fallback", () => {
      const [server, canvas] = serverThenCanvas("<p>[price]</p>");
      expect(server).toBe("1.234,5");
      expect(canvas).toBe(server);
    });

    test("reads a field off the queried entry", () => {
      const [server, canvas] = serverThenCanvas("<p>[headline]</p>");
      expect(server).toBe("Sommer");
      expect(canvas).toBe(server);
    });
  });

  test("mounts the canvas into the content root, seeded from the embedded tree", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/rich-text",
          attrs: { body: "<h2>Embedded</h2>" },
        },
      ],
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${JSON.stringify(content)}</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        origin: "http://localhost",
      });
    });

    expect(document.querySelector('[data-plumix-id="e1"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Embedded");
  });

  test("seeds the canvas with the embedded render env so styles paint", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/rich-text",
          attrs: { body: "<h2>Styled</h2>" },
          style: { large: { color: "#ff0000" } },
        },
      ],
    };
    const renderEnv = {
      tokens: { colors: { brand: { value: "#0000ff" } } },
      breakpoints: { tablet: 991, mobile: 640 },
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${JSON.stringify(content)}</script>` +
      `<script type="application/json" data-plumix-render-env>${JSON.stringify(renderEnv)}</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        origin: "http://localhost",
      });
    });

    const css = [
      ...document.querySelectorAll("[data-plumix-content-root] style"),
    ]
      .map((s) => s.textContent)
      .join(" ");
    expect(css).toContain("plumix-block-e1");
    expect(css).toContain("#ff0000");
  });

  test("sanitizes canvas html against the embedded allowlist, not the baseline", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/html",
          attrs: { html: '<p><img src="/cat.png"></p>' },
        },
      ],
    };
    // The published page renders this `img` because the operator allowed it;
    // a canvas still on the baseline would strip it and show the author a
    // narrower document than the one they are editing.
    const renderEnv = {
      htmlAllowlist: {
        allowedTags: [...BASELINE_HTML_ALLOWLIST.allowedTags, "img"],
        allowedAttributes: {
          ...BASELINE_HTML_ALLOWLIST.allowedAttributes,
          img: ["src"],
        },
      },
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${JSON.stringify(content)}</script>` +
      `<script type="application/json" data-plumix-render-env>${JSON.stringify(renderEnv)}</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        origin: "http://localhost",
      });
    });

    expect(document.querySelector('img[src="/cat.png"]')).not.toBeNull();
  });

  test("falls back to the baseline allowlist when the render env carries none", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/html",
          attrs: { html: '<p><img src="/cat.png"></p>' },
        },
      ],
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${JSON.stringify(content)}</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        origin: "http://localhost",
      });
    });

    expect(document.querySelector("img")).toBeNull();
  });

  test("a non-object render env does not take the whole canvas down", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        { id: "e1", name: "core/rich-text", attrs: { body: "<h2>Alive</h2>" } },
      ],
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${JSON.stringify(content)}</script>` +
      `<script type="application/json" data-plumix-render-env>null</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        origin: "http://localhost",
      });
    });

    expect(document.body.textContent).toContain("Alive");
  });

  test.each([
    ["malformed JSON", "{"],
    ["fields of the wrong kind", embed({ locale: 7, entry: "x", tokens: [] })],
  ])("a render env with %s still renders the canvas", (_, renderEnv) => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/rich-text",
          attrs: { body: "<p>© [year]</p>" },
        },
      ],
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${embed(content)}</script>` +
      `<script type="application/json" data-plumix-render-env>${renderEnv}</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        shortcodes: new Map(coreShortcodes.map((spec) => [spec.name, spec])),
        origin: "http://localhost",
      });
    });

    expect(document.querySelector('[data-plumix-id="e1"]')?.textContent).toBe(
      `© ${new Date().getFullYear()}`,
    );
  });

  // The embed is the one allowlist the sanitiser takes on trust from the DOM.
  // The floors are what make that safe, so pin them on this path too.
  test("a floor-violating embed still cannot re-admit a denied tag", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/html",
          attrs: { html: "<p>hi</p><script>alert(1)</script>" },
        },
      ],
    };
    const renderEnv = {
      htmlAllowlist: {
        allowedTags: [...BASELINE_HTML_ALLOWLIST.allowedTags, "script"],
        allowedAttributes: BASELINE_HTML_ALLOWLIST.allowedAttributes,
      },
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${embed(content)}</script>` +
      `<script type="application/json" data-plumix-render-env>${embed(renderEnv)}</script>` +
      `<div>ssr</div></div>`;

    act(() => {
      mountEditorRuntime({
        doc: document,
        registry,
        origin: "http://localhost",
      });
    });

    const canvas = document.querySelector("[data-plumix-id='e1']");
    expect(canvas?.querySelector("script")).toBeNull();
    expect(canvas?.textContent).toContain("hi");
  });

  test("does nothing on a page with no content root", () => {
    document.body.innerHTML = "<main>plain page</main>";

    const cleanup = mountEditorRuntime({
      doc: document,
      registry,
      origin: "http://localhost",
    });

    expect(cleanup).toBeNull();
  });
});
