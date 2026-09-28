import { afterEach, describe, expect, test } from "vitest";

import { documentBasePath } from "./document-base-path.js";

afterEach(() => {
  document.head.replaceChildren();
});

/** The marker the islands bootstrap `<script>` injects. */
function markBasePath(basePath: string): void {
  const script = document.createElement("script");
  script.dataset.plumixBasePath = basePath;
  document.head.append(script);
}

describe("documentBasePath", () => {
  test("is empty when no bootstrap script marked the document", () => {
    expect(documentBasePath()).toBe("");
  });

  test("is empty at the domain root, where the marker is empty", () => {
    markBasePath("");
    expect(documentBasePath()).toBe("");
  });

  test("reads the subdirectory prefix off the marker", () => {
    markBasePath("/custom-directory");
    expect(documentBasePath()).toBe("/custom-directory");
  });

  test("ignores a script carrying no base-path marker", () => {
    document.head.append(document.createElement("script"));
    expect(documentBasePath()).toBe("");
  });
});
