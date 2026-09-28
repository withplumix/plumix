import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { StaticHtml } from "./static-html.js";

describe("StaticHtml", () => {
  test("renders <plumix-static-slot> with the given inner HTML and slot name", () => {
    const html = renderToStaticMarkup(
      <StaticHtml html="<strong>x</strong>" slotName="children" />,
    );
    expect(html).toContain('<plumix-static-slot data-plumix-slot="children"');
    expect(html).toContain("<strong>x</strong>");
  });

  test("defaults slotName to 'children' when omitted", () => {
    const html = renderToStaticMarkup(<StaticHtml html="<em>y</em>" />);
    expect(html).toContain('data-plumix-slot="children"');
  });

  test("memo() comparator always returns true — never re-renders on parent state change", () => {
    // `React.memo(C, () => true)` short-circuits re-renders. We can't
    // observe React's commit directly from SSR, but the memo comparator
    // IS a public surface: invoking it must return true regardless of
    // prop deltas. That's the contract the runtime depends on so the
    // SSR'd HTML survives parent re-renders.
    const Memoized = StaticHtml as unknown as {
      compare?: (prev: unknown, next: unknown) => boolean;
    };
    // React stores the comparator on the component's `compare` slot for
    // `memo(Component, compare)`. We invoke it with arbitrarily-different
    // props to prove it always returns true.
    expect(Memoized.compare).toBeDefined();
    if (!Memoized.compare) return;
    expect(
      Memoized.compare(
        { html: "<strong>a</strong>", slotName: "children" },
        { html: "<em>b</em>", slotName: "caption" },
      ),
    ).toBe(true);
  });
});
