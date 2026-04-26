import type { Plugin } from "vite";

import type { ImportMap } from "@plumix/core";

// `head-prepend` is load-bearing: `<script type="importmap">` MUST
// appear before the first module script that consumes any of its
// mappings, otherwise the browser resolves bare specifiers using the
// default loader (i.e. fails).
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
