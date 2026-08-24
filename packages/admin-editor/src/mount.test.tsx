import { act } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  BASELINE_HTML_ALLOWLIST,
  coreBlocks,
  createBlockRegistry,
} from "@plumix/blocks";

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
