import type { ReactNode } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { useHtmlAllowlist } from "../../blocks/html/context.js";
import { IslandRenderContext, IslandShim } from "../../blocks/island-shim.js";
import { createIslandRender } from "./island-render.js";

function Reader(): ReactNode {
  return h("i", null, useHtmlAllowlist().allowedTags.join());
}

describe("createIslandRender", () => {
  test("an island renders with the page's HTML allowlist", () => {
    const allowlist = { allowedTags: ["marquee"], allowedAttributes: {} };
    const html = renderToStaticMarkup(
      h(
        IslandRenderContext.Provider,
        { value: createIslandRender(allowlist) },
        h(IslandShim, {
          Component: Reader,
          exportName: "Reader",
          chunkUrl: "/Reader.js",
          props: {},
        }),
      ),
    );

    expect(html).toContain("<i>marquee</i>");
  });
});
