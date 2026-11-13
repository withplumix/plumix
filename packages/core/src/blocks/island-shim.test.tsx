import type { ReactElement, ReactNode } from "react";
import { createContext, createElement as h, useId } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createIslandRender } from "../route/render/island-render.js";
import { createBlockRegistry } from "./block-registry.js";
import { BASELINE_HTML_ALLOWLIST } from "./html/sanitize.js";
import {
  InsideIslandContext,
  IslandRenderContext,
  IslandShim,
} from "./island-shim.js";
import { IslandPropSerializationError } from "./serialize.js";

type Props = Readonly<Record<string, unknown>>;

/**
 * Wrap `Component` exactly as the SSR shim the Vite transform generates
 * does: hand the raw props to `IslandShim`, which owns the boundary
 * decision.
 */
function island(
  Component: (props: Props) => ReactNode,
  exportName: string,
  props: Props = {},
): ReactElement {
  return h(IslandShim, {
    Component,
    exportName,
    chunkUrl: `/${exportName}.js`,
    props,
  });
}

function islandCount(html: string): number {
  return (html.match(/<plumix-island/g) ?? []).length;
}

describe("IslandShim boundary", () => {
  test("an outermost use-client component becomes a <plumix-island> and serializes its own props once", () => {
    const Widget = () => h("div", null, "hi");
    const html = renderToStaticMarkup(island(Widget, "Widget", { n: 1 }));

    expect(islandCount(html)).toBe(1);
    expect(html).toContain('component-export="Widget"');
    // Author prop survives, encoded in the plumix tuple format ([0,1] = Value
    // 1).
    expect(html).toContain("&quot;n&quot;:[0,1]");
    expect(html).toContain("<div>hi</div>");
  });

  test("a non-directive use-client component rendered inside an island renders inline — no nested island, no re-serialization", () => {
    const Inner = () => h("span", null, "inner");
    const Parent = () => h("section", null, island(Inner, "Inner")); // nested shim, no client directive
    const html = renderToStaticMarkup(island(Parent, "Parent", { n: 1 }));

    // Only the parent is an island; the inner shared primitive is bundled.
    expect(islandCount(html)).toBe(1);
    expect(html).toContain("<span>inner</span>");
    expect(html).not.toContain('component-export="Inner"');
  });

  test("a nested component WITH an explicit client directive stays its own island (intentional nesting preserved)", () => {
    const Inner = () => h("span", null, "inner");
    const Parent = () =>
      h("section", null, island(Inner, "Inner", { client: "visible" }));
    const html = renderToStaticMarkup(island(Parent, "Parent"));

    expect(islandCount(html)).toBe(2);
    expect(html).toContain('component-export="Inner"');
  });

  test("a use-client component passed as a child/slot becomes its own island so it still hydrates (children compose in the outer scope)", () => {
    const Inner = () => h("span", null, "inner");
    const Parent = (props: Props) =>
      h("section", null, props.children as ReactNode);
    const html = renderToStaticMarkup(
      island(Parent, "Parent", { children: island(Inner, "Inner") }),
    );

    // Inlined, passed-in children would be frozen static markup; as their own
    // island the client upgrades them independently.
    expect(islandCount(html)).toBe(2);
    expect(html).toContain('component-export="Inner"');
    expect(html).toContain('data-plumix-slot="children"');
  });

  test("internally-rendered use-client descendants stay a single island through multiple levels", () => {
    const L3 = () => h("span", null, "L3");
    const L2 = () => island(L3, "L3");
    const L1 = () => island(L2, "L2");
    const html = renderToStaticMarkup(island(L1, "L1", { n: 1 }));

    // The InsideIsland context keeps propagating `true` through each inline
    // render, so nothing below the outermost boundary re-islands.
    expect(islandCount(html)).toBe(1);
    expect(html).toContain("<span>L3</span>");
  });

  test("the inline path does not leak client/prefetch props onto the rendered component", () => {
    const Inner = (props: Props) => h("div", props, "x");
    const Parent = () =>
      island(Inner, "Inner", { prefetch: "load", title: "t" });
    const html = renderToStaticMarkup(island(Parent, "Parent", { n: 1 }));

    expect(html).toContain('title="t"');
    expect(html).not.toContain('prefetch="load"');
  });

  // Radix threads a genuinely cyclic React Context inside a plain `__scope`
  // object; a nested shim re-serializing its props would hit the cycle and
  // throw.
  test("does not throw when a nested primitive carries a cyclic value (regression: #1702)", () => {
    const CyclicCtx = createContext<unknown>(null);
    const scope = { tabs: [CyclicCtx] }; // Radix's __scope shape: context in a plain object
    const Inner = () => null;
    const Parent = () => h("div", null, island(Inner, "Inner", { scope }));

    expect(() =>
      renderToStaticMarkup(island(Parent, "Parent", { n: 1 })),
    ).not.toThrow();
  });

  test("the cyclic value WOULD break serialization at an island boundary — proving the inline path is what saves it", () => {
    const CyclicCtx = createContext<unknown>(null);
    const scope = { tabs: [CyclicCtx] };
    const Inner = () => null;

    // Same cyclic prop, but now the shim is the outermost boundary, so it
    // serializes — and the cycle detector fires, as designed.
    expect(() =>
      renderToStaticMarkup(island(Inner, "Inner", { scope })),
    ).toThrow(IslandPropSerializationError);
  });

  test("exposes InsideIslandContext defaulting to false so a bare render is treated as outermost", () => {
    expect(InsideIslandContext).toBeDefined();
  });

  test("defaults the hydration trigger to interaction and prefetch to visible", () => {
    const Widget = () => h("div", null, "hi");
    const html = renderToStaticMarkup(island(Widget, "Widget"));

    expect(html).toContain('client="interaction"');
    expect(html).toContain('prefetch="visible"');
  });

  test("honors an explicit client directive and resolves its prefetch default", () => {
    const Widget = () => h("div", null, "hi");
    const html = renderToStaticMarkup(
      island(Widget, "Widget", { client: "idle" }),
    );

    expect(html).toContain('client="idle"');
    // idle → load per the prefetch defaults table.
    expect(html).toContain('prefetch="load"');
  });

  test("an `only` island emits an empty shell with no ssr gate and no server markup", () => {
    const Widget = () => h("div", null, "should-not-render");
    const html = renderToStaticMarkup(
      island(Widget, "Widget", { client: "only" }),
    );

    expect(islandCount(html)).toBe(1);
    expect(html).not.toContain("should-not-render");
    expect(html).not.toContain('ssr=""');
  });

  test("wraps a React-element prop in <plumix-static-slot>, lists it on `slots`, and keeps it out of the serialized props", () => {
    const Widget = (props: Props) =>
      h("div", null, props.children as ReactNode);
    const slotEl = h("b", null, "slotted");
    const html = renderToStaticMarkup(
      island(Widget, "Widget", { children: slotEl, n: 2 }),
    );

    expect(html).toContain('data-plumix-slot="children"');
    expect(html).toContain('slots="children"');
    // The element prop is bridged as a slot, never serialized; the scalar
    // prop still is.
    expect(html).toContain("&quot;n&quot;:[0,2]");
    expect(html).not.toContain("&quot;children&quot;");
  });
});

/** Renders `tree` as the page render does: one island counter per render. */
function renderPage(tree: ReactNode): string {
  return renderToStaticMarkup(
    h(
      IslandRenderContext.Provider,
      {
        value: createIslandRender({
          htmlAllowlist: BASELINE_HTML_ALLOWLIST,
          plumix: { registry: createBlockRegistry([]) },
        }),
      },
      tree,
    ),
  );
}

function UseIdProbe(): ReactNode {
  return h("span", { id: useId() });
}

describe("IslandShim id scope", () => {
  test("two islands calling useId render ids scoped to their own prefix, written to `id-prefix`", () => {
    const html = renderPage(
      h(
        "main",
        null,
        h("p", null, "before"),
        island(UseIdProbe, "First"),
        island(UseIdProbe, "Second"),
      ),
    );

    expect(html).toMatch(
      /<plumix-island[^>]*component-export="First"[^>]*id-prefix="i0-"[^>]*><span id="_i0-R_[^"]+"><\/span><\/plumix-island>/,
    );
    expect(html).toMatch(
      /<plumix-island[^>]*component-export="Second"[^>]*id-prefix="i1-"[^>]*><span id="_i1-R_[^"]+"><\/span><\/plumix-island>/,
    );
  });

  test("an island passed into another island's slot takes the next index from the same counter", () => {
    const Parent = (props: Props) =>
      h("section", null, props.children as ReactNode);
    const html = renderPage(
      island(Parent, "Parent", { children: island(UseIdProbe, "Child") }),
    );

    expect(html).toMatch(/component-export="Parent"[^>]*id-prefix="i0-"/);
    expect(html).toMatch(
      /component-export="Child"[^>]*id-prefix="i1-"[^>]*><span id="_i1-R_[^"]+">/,
    );
  });

  test("an `only` island renders an empty shell with no `id-prefix`", () => {
    const html = renderPage(island(UseIdProbe, "Widget", { client: "only" }));

    expect(html).not.toContain("id-prefix");
    expect(html).not.toContain("<span");
  });
});
