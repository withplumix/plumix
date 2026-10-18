import { loadOnce } from "plumix/support";

import type { CardRenderer } from "./renderer.js";
import { BUNDLED_ENGINE_FONTS, PNG_CONTENT_TYPE } from "./renderer.js";

/**
 * Loaded through a dynamic import so the wasm stays off the static graph of
 * everything that installs the plugin.
 */
export function bundledRenderer(): CardRenderer {
  const engine = loadOnce(() =>
    import("./takumi.js").then((module) => module.takumi()),
  );
  return {
    // Declared here: the plugin must know the formats before loading the
    // engine.
    fonts: BUNDLED_ENGINE_FONTS,
    contentType: PNG_CONTENT_TYPE,
    render: async (node, input) => {
      return (await engine()).render(node, input);
    },
  };
}
