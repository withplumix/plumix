import type { Plugin } from "vite";

import { SHARED_RUNTIME_SPECIFIERS } from "@plumix/core";

/**
 * Vite plugin for plugin authors. Marks the host's shared-runtime
 * specifiers (`react`, `react-dom`, `@tanstack/*`) external so the
 * plugin chunk imports them by bare specifier — the admin's importmap
 * resolves those at runtime to the host's vendor chunks, guaranteeing a
 * single React instance across host + plugin.
 *
 * Drop into a plugin's `vite.config.ts`:
 *
 *     import { plumixPluginAuthor } from "plumix/vite";
 *
 *     export default defineConfig({
 *       plugins: [react(), plumixPluginAuthor()],
 *       build: {
 *         lib: { entry: "./src/admin.ts", formats: ["es"], fileName: "admin" },
 *       },
 *     });
 *
 * The `external` list is the source of truth in `@plumix/core` —
 * adding to it there automatically extends the contract.
 */
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
