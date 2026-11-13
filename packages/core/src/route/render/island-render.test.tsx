import type { ReactNode } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { HtmlAllowlist } from "../../blocks/html/allowlist.js";
import type { PlumixContextValue } from "../../blocks/renderer/index.js";
import { createBlockRegistry } from "../../blocks/block-registry.js";
import { BASELINE_HTML_ALLOWLIST } from "../../blocks/html/allowlist.js";
import { useHtmlAllowlist } from "../../blocks/html/context.js";
import { IslandRenderContext, IslandShim } from "../../blocks/island-shim.js";
import { Link } from "../../blocks/renderer/index.js";
import { createIslandRender } from "./island-render.js";

const plumix: PlumixContextValue = {
  registry: createBlockRegistry([]),
  basePath: "/blog",
};

function renderIsland(
  Component: (props: Readonly<Record<string, unknown>>) => ReactNode,
  props: Readonly<Record<string, unknown>>,
  htmlAllowlist: HtmlAllowlist = BASELINE_HTML_ALLOWLIST,
): string {
  return renderToStaticMarkup(
    h(
      IslandRenderContext.Provider,
      { value: createIslandRender({ htmlAllowlist, plumix }) },
      h(IslandShim, {
        Component,
        exportName: "Widget",
        chunkUrl: "/Widget.js",
        props,
      }),
    ),
  );
}

function Reader(): ReactNode {
  return h("i", null, useHtmlAllowlist().allowedTags.join());
}

function Frame(props: Readonly<Record<string, unknown>>): ReactNode {
  return h("section", null, props.children as ReactNode);
}

describe("createIslandRender", () => {
  test("an island renders with the page's HTML allowlist", () => {
    const allowlist = { allowedTags: ["marquee"], allowedAttributes: {} };

    const html = renderIsland(Reader, {}, allowlist);

    expect(html).toContain("<i>marquee</i>");
  });

  test("a slot inside an island renders with the page's Plumix context", () => {
    const html = renderIsland(Frame, {
      children: h(Link, { href: "/x" }, "x"),
    });

    expect(html).toContain('href="/blog/x"');
  });
});
