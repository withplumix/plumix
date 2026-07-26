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

  test("dev: a component throw dispatches plumix:island-error with the component stack", async () => {
    const prev = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    const events: CustomEvent[] = [];
    const listener = (event: Event): void => {
      events.push(event as CustomEvent);
    };
    window.addEventListener("plumix:island-error", listener);
    // React logs the uncaught error to the console; silence it for the run.
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const Boom = (): never => {
      throw new Error("render boom");
    };
    const el = document.createElement("div");
    document.body.appendChild(el);

    active = mount(el);
    active.render(Boom, {}, {});

    await vi.waitFor(() => expect(events).toHaveLength(1));
    const detail = events[0]?.detail as {
      error?: unknown;
      componentStack?: string;
      element?: HTMLElement;
    };
    expect((detail.error as Error).message).toBe("render boom");
    expect(detail.componentStack).toContain("Boom");
    expect(detail.element).toBe(el);

    window.removeEventListener("plumix:island-error", listener);
    errorSpy.mockRestore();
    process.env.PLUMIX_DEV = prev;
  });

  test("prod: a component throw does not dispatch plumix:island-error", async () => {
    const prev = process.env.PLUMIX_DEV;
    delete process.env.PLUMIX_DEV;
    const events: Event[] = [];
    const listener = (event: Event): void => {
      events.push(event);
    };
    window.addEventListener("plumix:island-error", listener);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // React's default root handler reports the uncaught throw to `window`;
    // swallow it so it doesn't surface as an unhandled error in the run.
    const swallow = (event: Event): void => event.preventDefault();
    window.addEventListener("error", swallow);

    const Boom = (): never => {
      throw new Error("render boom");
    };
    const el = document.createElement("div");
    document.body.appendChild(el);

    active = mount(el);
    active.render(Boom, {}, {});

    // Give React a chance to throw and settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toHaveLength(0);

    window.removeEventListener("plumix:island-error", listener);
    window.removeEventListener("error", swallow);
    errorSpy.mockRestore();
    process.env.PLUMIX_DEV = prev;
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
