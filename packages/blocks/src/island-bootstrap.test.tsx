import { render } from "@testing-library/react";
import { Node as TiptapNode } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import type { BlockProps, TiptapNode as TiptapNodeJson } from "./types.js";
import { defineBlock } from "./define-block.js";
import { jsonForScriptTag, PlumixIslandBootstrap } from "./island-bootstrap.js";
import { mergeBlockRegistry } from "./registry.js";

function islandSpec(name: string, src: string, exp?: string) {
  return defineBlock({
    name,
    title: name,
    schema: () => Promise.resolve(TiptapNode.create({ name, group: "block" })),
    component: () => Promise.resolve(({ children }: BlockProps) => children),
    client: { src, ...(exp !== undefined && { export: exp }) },
  });
}

describe("PlumixIslandBootstrap", () => {
  test("emits one script tag that imports each unique active island", async () => {
    const registry = await mergeBlockRegistry({
      core: [
        islandSpec("core/widget", "/assets/widget.js"),
        islandSpec("core/gallery", "/assets/gallery.js", "mount"),
      ],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [
        { type: "core/widget" },
        { type: "core/gallery" },
        { type: "core/widget" },
      ],
    };
    const { container } = render(
      <PlumixIslandBootstrap content={doc} registry={registry} />,
    );
    const scripts = container.querySelectorAll('script[type="module"]');
    expect(scripts.length).toBe(1);
    const body = scripts[0]?.textContent ?? "";
    // One import per unique island, dedup preserved.
    expect(body).toContain('"/assets/widget.js"');
    expect(body).toContain('"/assets/gallery.js"');
    // Default vs named export both reachable.
    expect(body).toContain('"core/widget"');
    expect(body).toContain('"core/gallery"');
    expect(body).toContain('"mount"');
  });

  test("escapes script-breakout characters in the embedded manifest", async () => {
    // `defineBlock` already rejects `<` / `>` / `&` in `client.src`, so a
    // hostile spec can't reach the bootstrap directly — but the manifest
    // also embeds `name`, which is a separate path (block names use a
    // restricted pattern but the bootstrap should still belt-and-brace).
    const registry = await mergeBlockRegistry({
      core: [islandSpec("core/widget", "/assets/widget.js")],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [{ type: "core/widget" }],
    };
    const { container } = render(
      <PlumixIslandBootstrap content={doc} registry={registry} />,
    );
    const body = container.querySelector('script[type="module"]')?.textContent;
    // Even though the inputs here are benign, the encoder should be in
    // play: no raw `<` / `>` / `&` should appear inside the JSON literal
    // (they'd be hex-escaped as `<` etc.). The bootstrap code below
    // legitimately contains `<` from the template-literal tick + `${...}`
    // — the assertion is on the JSON segment alone.
    const jsonMatch = body?.match(/const islands = (\[.*?\]);/u);
    expect(jsonMatch).not.toBeNull();
    expect(jsonMatch?.[1]).not.toMatch(/[<>&]/);
  });

  test("jsonForScriptTag escapes `</script>` and JS line-terminator bytes", () => {
    // Drive the encoder directly so the defense is verified in
    // isolation from `defineBlock`'s upstream rejection. Embedding any
    // of these bytes raw into a `<script>` body would break out.
    const out = jsonForScriptTag({
      script: "</script><img src=x onerror=alert(1)>",
      htmlComment: "<!-- escape -->",
      ampersand: "a&b",
      lineSep: " ",
      paraSep: " ",
    });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&");
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    // Round-trips back to the original payload.
    expect(JSON.parse(out)).toEqual({
      script: "</script><img src=x onerror=alert(1)>",
      htmlComment: "<!-- escape -->",
      ampersand: "a&b",
      lineSep: " ",
      paraSep: " ",
    });
  });

  test("rejects an island registered with `</script>` in src at defineBlock time", () => {
    expect(() =>
      islandSpec("core/evil", "/x</script><img src=x onerror=alert(1)>"),
    ).toThrow(/invalid_client_island|client\.src/);
  });

  test("rejects an island registered with javascript: scheme", () => {
    expect(() => islandSpec("core/evil", "javascript:alert(1)")).toThrow(
      /invalid_client_island|client\.src/,
    );
  });

  test("emits nothing when content has no client-bearing blocks", async () => {
    const plain = defineBlock({
      name: "core/plain",
      title: "Plain",
      schema: () =>
        Promise.resolve(
          TiptapNode.create({ name: "core/plain", group: "block" }),
        ),
      component: () => Promise.resolve(({ children }: BlockProps) => children),
    });
    const registry = await mergeBlockRegistry({
      core: [plain],
      plugins: [],
      themeOverrides: {},
      themeId: null,
    });
    const doc: TiptapNodeJson = {
      type: "doc",
      content: [{ type: "core/plain" }],
    };
    const { container } = render(
      <PlumixIslandBootstrap content={doc} registry={registry} />,
    );
    expect(container.querySelectorAll("script").length).toBe(0);
  });
});
