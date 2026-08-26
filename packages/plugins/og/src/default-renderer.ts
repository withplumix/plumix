import type { CardRenderer } from "./renderer.js";
import { PNG_CONTENT_TYPE } from "./renderer.js";

/**
 * The renderer a plugin with no `renderer:` gets: the bundled engine
 * rasterizing to PNG, the format every scraper accepts. It is reached through a
 * dynamic import of the package's own subpath so the wasm stays off the static
 * graph of everything that merely installs the plugin — the invariant
 * `cold-path.test.ts` holds.
 */
export function bundledRenderer(): CardRenderer {
  let engine: Promise<CardRenderer> | undefined;
  return {
    contentType: PNG_CONTENT_TYPE,
    render: async (node, input) => {
      engine ??= import("./takumi.js").then((module) => module.takumi());
      return (await engine).render(node, input);
    },
  };
}
