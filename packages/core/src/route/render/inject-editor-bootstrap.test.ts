import { describe, expect, test } from "vitest";

import type { AssetManifest } from "./asset-manifest.js";
import { injectEditorBootstrap } from "./inject-editor-bootstrap.js";

const BODY = "<main>content</main>";

describe("injectEditorBootstrap", () => {
  test("leaves the body untouched when the edit gate says not to inject", () => {
    const out = injectEditorBootstrap(BODY, false, {}, "serve");

    expect(out).toBe(BODY);
  });

  test("appends the editor runtime script (dev path) when injecting", () => {
    const out = injectEditorBootstrap(BODY, true, {}, "serve");

    expect(out.startsWith(BODY)).toBe(true);
    expect(out).toContain("/.plumix/editor-entry.ts");
    expect(out).toContain("data-plumix-editor");
  });

  test("uses the hashed asset path from the manifest in build", () => {
    const manifest: AssetManifest = {
      ".plumix/editor-entry.ts": { file: "assets/editor-abc123.js" },
    };

    const out = injectEditorBootstrap(BODY, true, manifest, "build");

    expect(out).toContain("/assets/editor-abc123.js");
    expect(out).not.toContain("/.plumix/editor-entry.ts");
  });
});
