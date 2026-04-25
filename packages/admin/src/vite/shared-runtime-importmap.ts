import type { Plugin } from "vite";

import type { ImportMap } from "@plumix/core";

/**
 * Injects a `<script type="importmap">` block into the admin's
 * `index.html` so plugin chunks loaded later can resolve bare
 * specifiers (`react`, etc.) to the host's vendor chunks.
 *
 * Placed via Vite's `tags` API in `head-prepend` so it precedes every
 * other script — `<script type="importmap">` MUST appear before the
 * first module script that consumes any of its mappings.
 */
export function sharedRuntimeImportmap(importMap: ImportMap): Plugin {
  return {
    name: "plumix:shared-runtime-importmap",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "importmap" },
          children: JSON.stringify(importMap),
          injectTo: "head-prepend",
        },
      ];
    },
  };
}
