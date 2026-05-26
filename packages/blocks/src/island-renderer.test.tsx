import { afterEach, describe, expect, test, vi } from "vitest";

import type { IslandRoot } from "./island-renderer.js";
import { mount } from "./island-renderer.js";

describe("island renderer mount()", () => {
  let active: IslandRoot | null = null;

  afterEach(async () => {
    // Unmount + drain a microtask so React 19's scheduler tears the root
    // down before jsdom teardown (mirrors the island-element suite).
    active?.unmount();
    active = null;
    document.body.innerHTML = "";
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("renders the component into the element with the given props", async () => {
    const Component = (props: Readonly<Record<string, unknown>>) => (
      <span>{String(props.label)}</span>
    );
    const el = document.createElement("div");
    document.body.appendChild(el);

    active = mount(el);
    active.render(Component, { label: "hi" }, {});

    await vi.waitFor(() => expect(el.textContent).toBe("hi"));
  });

  test("wraps named slot HTML in a StaticHtml element on the matching prop", async () => {
    const seen: Readonly<Record<string, unknown>>[] = [];
    const Component = (props: Readonly<Record<string, unknown>>) => {
      seen.push(props);
      return <div>{props.children as never}</div>;
    };
    const el = document.createElement("div");
    document.body.appendChild(el);

    active = mount(el);
    active.render(
      Component,
      { label: "x" },
      {
        children: "<strong>kid</strong>",
      },
    );

    await vi.waitFor(() => expect(seen).toHaveLength(1));
    // Scalar prop passes through untouched.
    expect(seen[0]?.label).toBe("x");
    // The slot prop is now a React element (the StaticHtml bridge).
    const children = seen[0]?.children as { $$typeof?: symbol } | undefined;
    expect(typeof children?.$$typeof).toBe("symbol");
    // …and its HTML commits into a <plumix-static-slot> wrapper.
    await vi.waitFor(() =>
      expect(el.querySelector("plumix-static-slot")?.innerHTML).toBe(
        "<strong>kid</strong>",
      ),
    );
  });

  test("unmount() tears down the rendered tree", async () => {
    const Component = (props: Readonly<Record<string, unknown>>) => (
      <span>{String(props.label)}</span>
    );
    const el = document.createElement("div");
    document.body.appendChild(el);

    const root = mount(el);
    root.render(Component, { label: "bye" }, {});
    await vi.waitFor(() => expect(el.textContent).toBe("bye"));

    root.unmount();
    await vi.waitFor(() => expect(el.textContent).toBe(""));
  });
});
