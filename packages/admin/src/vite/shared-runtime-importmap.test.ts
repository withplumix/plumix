import type { HtmlTagDescriptor } from "vite";
import { describe, expect, test } from "vitest";

import { buildSharedRuntimeImportMap } from "@plumix/core";

import { sharedRuntimeImportmap } from "./shared-runtime-importmap.js";

const IMPORT_MAP = buildSharedRuntimeImportMap("/_plumix/admin");

function callTransform(): readonly HtmlTagDescriptor[] {
  const plugin = sharedRuntimeImportmap(IMPORT_MAP);
  const hook = plugin.transformIndexHtml;
  if (typeof hook !== "function") {
    throw new Error("plugin.transformIndexHtml must be a function");
  }
  return (hook as unknown as () => readonly HtmlTagDescriptor[])();
}

describe("sharedRuntimeImportmap", () => {
  test('returns a single <script type="importmap"> tag', () => {
    const tags = callTransform();
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({
      tag: "script",
      attrs: { type: "importmap" },
      injectTo: "head-prepend",
    });
  });

  test("emits the importmap as JSON in the script body", () => {
    const tags = callTransform();
    const body = tags[0]?.children;
    if (typeof body !== "string") throw new Error("expected string children");
    const parsed = JSON.parse(body) as unknown;
    expect(parsed).toEqual(IMPORT_MAP);
  });

  test("injects to head-prepend so it precedes other module scripts", () => {
    const tags = callTransform();
    expect(tags[0]?.injectTo).toBe("head-prepend");
  });
});
