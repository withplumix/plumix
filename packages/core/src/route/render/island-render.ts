import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type { HtmlAllowlist } from "../../blocks/html/sanitize.js";
import type { IslandRender } from "../../blocks/island-shim.js";
import { HtmlAllowlistProvider } from "../../blocks/html/context.js";
import { IslandRenderContext } from "../../blocks/island-shim.js";

/**
 * One per page render, so every page numbers its islands from `i0-`. Context
 * does not cross into an island's own render, so it provides the page's again.
 */
export function createIslandRender(htmlAllowlist: HtmlAllowlist): IslandRender {
  let next = 0;
  const islandRender: IslandRender = {
    take: () => next++,
    render: (node, identifierPrefix) =>
      renderToString(
        createElement(
          HtmlAllowlistProvider,
          { value: htmlAllowlist },
          createElement(
            IslandRenderContext.Provider,
            { value: islandRender },
            node,
          ),
        ),
        { identifierPrefix },
      ),
  };
  return islandRender;
}
