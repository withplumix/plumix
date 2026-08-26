import type { CardRenderer } from "./renderer.js";
import { SVG_CONTENT_TYPE } from "./renderer.js";

/**
 * The renderer a plugin with no `renderer:` gets. It is the bundled engine,
 * reached through a dynamic import of the package's own subpath so the wasm
 * stays off the static graph of everything that merely installs the plugin —
 * the invariant `cold-path.test.ts` holds.
 */
export function bundledRenderer(): CardRenderer {
  let engine: Promise<CardRenderer> | undefined;
  return {
    contentType: SVG_CONTENT_TYPE,
    render: async (node, input) => {
      engine ??= import("./takumi.js").then((module) => module.svgOnly());
      return (await engine).render(node, input);
    },
  };
}
