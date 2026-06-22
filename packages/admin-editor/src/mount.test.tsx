import { act } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { coreBlocks, createBlockRegistry } from "@plumix/blocks";

import { mountEditorRuntime } from "./mount.js";

const registry = createBlockRegistry(coreBlocks);

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
          name: "core/heading",
          attrs: { text: "Embedded", level: 2 },
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

  test("seeds the canvas with the embedded style env so styles paint", () => {
    const content = {
      version: "plumix.v2",
      blocks: [
        {
          id: "e1",
          name: "core/heading",
          attrs: { text: "Styled", level: 2 },
          style: { large: { color: { raw: "#ff0000" } } },
        },
      ],
    };
    const styleEnv = {
      tokens: { colors: { brand: { value: "#0000ff" } } },
      breakpoints: { tablet: 991, mobile: 640 },
    };
    document.body.innerHTML =
      `<div data-plumix-content-root>` +
      `<script type="application/json" data-plumix-initial-tree>${JSON.stringify(content)}</script>` +
      `<script type="application/json" data-plumix-style-env>${JSON.stringify(styleEnv)}</script>` +
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
