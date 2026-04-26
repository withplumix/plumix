import type { Plugin } from "vite";

import { SHARED_RUNTIME_SPECIFIERS } from "@plumix/core";

// Marks shared-runtime specifiers external so the plugin chunk imports
// them by bare specifier; the admin's importmap resolves those to the
// host's vendor chunks at runtime, guaranteeing a single React instance
// across host + plugin.
export function plumixPluginAuthor(): Plugin {
  return {
    name: "plumix:plugin-author",
    enforce: "pre",
    config() {
      return {
        build: {
          rollupOptions: {
            external: [...SHARED_RUNTIME_SPECIFIERS],
          },
        },
      };
    },
  };
}
