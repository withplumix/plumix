import type { MutablePluginRegistry } from "../plugin/manifest.js";
import type { RegisteredSearchProvider } from "../plugin/search-provider.js";
import { entriesSearchHandler } from "./entries-handler.js";
import { termsSearchHandler } from "./terms-handler.js";
import { usersSearchHandler } from "./users-handler.js";

/**
 * Register core's admin search provider: entries, terms and users. Called at
 * app boot before plugins install, so core leads its order band.
 */
export function registerCoreSearchProvider(
  registry: MutablePluginRegistry,
): void {
  const provider: RegisteredSearchProvider = {
    id: "core",
    registeredBy: null,
    search: async (input, ctx) => {
      const groups = await Promise.all([
        entriesSearchHandler(input, ctx),
        termsSearchHandler(input, ctx),
        usersSearchHandler(input, ctx),
      ]);
      return groups.flat();
    },
  };
  registry.searchProviders.set(provider.id, provider);
}
