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

  const mismatchCleanups: (() => void)[] = [];
  afterEach(() => {
    for (const off of mismatchCleanups) off();
    mismatchCleanups.length = 0;
  });

  // A window listener for the hydration-mismatch diagnostic, auto-removed each
  // test. Returns the captured events so a case can assert count + detail.
  function listenForMismatch(): CustomEvent[] {
    const events: CustomEvent[] = [];
    const listener = (event: Event): void => {
      events.push(event as CustomEvent);
    };
    window.addEventListener("plumix:island-hydration-mismatch", listener);
    mismatchCleanups.push(() =>
      window.removeEventListener("plumix:island-hydration-mismatch", listener),
    );
    return events;
  }

  test("dev: a hydrating island with matching server HTML adopts it, emitting no mismatch", async () => {
    const prev = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    const events = listenForMismatch();

    const Component = (props: Readonly<Record<string, unknown>>) => (
      <span>{String(props.label)}</span>
    );
    const el = document.createElement("div");
    // The server render the island hydrates against.
    el.innerHTML = "<span>hi</span>";
    document.body.appendChild(el);

    active = mount(el, { hydrate: true });
    active.render(Component, { label: "hi" }, {});

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toHaveLength(0);
    expect(el.textContent).toBe("hi");

    process.env.PLUMIX_DEV = prev;
  });

  test("dev: a server/client mismatch dispatches the diagnostic with the component stack and does not throw", async () => {
    const prev = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    const events = listenForMismatch();

    // Server said SERVER, client renders CLIENT — a text-only divergence, the
    // most common non-determinism bug (e.g. a rendered `Date.now()`).
    const Component = () => <span>CLIENT</span>;
    const el = document.createElement("div");
    el.innerHTML = "<span>SERVER</span>";
    document.body.appendChild(el);

    active = mount(el, { hydrate: true });
    active.render(Component, {}, {});

    await vi.waitFor(() => expect(events).toHaveLength(1));
    const detail = events[0]?.detail as {
      element?: HTMLElement;
      componentStack?: string;
      server?: string;
      client?: string;
    };
    expect(detail.element).toBe(el);
    expect(detail.componentStack).toContain("Component");
    // Both renders are captured: the server markup as it was before hydration,
    // and the client markup React re-rendered on recovery (#1668).
    expect(detail.server).toBe("<span>SERVER</span>");
    expect(detail.client).toBe("<span>CLIENT</span>");
    // React recovered by client-rendering the subtree — the page did not crash.
    expect(el.textContent).toBe("CLIENT");

    process.env.PLUMIX_DEV = prev;
  });

  test("dev: a later props change re-renders without re-hydrating", async () => {
    const prev = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    const events = listenForMismatch();

    const Component = (props: Readonly<Record<string, unknown>>) => (
      <span>{String(props.label)}</span>
    );
    const el = document.createElement("div");
    el.innerHTML = "<span>A</span>";
    document.body.appendChild(el);

    active = mount(el, { hydrate: true });
    active.render(Component, { label: "A" }, {}); // first render hydrates
    // The server text already reads "A", so let the hydration commit (a
    // macrotask) before the props change — otherwise the second render would
    // race the in-flight hydration rather than reconcile against it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    active.render(Component, { label: "B" }, {}); // props change re-renders
    await vi.waitFor(() => expect(el.textContent).toBe("B"));
    // A re-render never reconciles against the server DOM, so nothing can
    // register as a mismatch on a later `props` change.
    expect(events).toHaveLength(0);

    process.env.PLUMIX_DEV = prev;
  });

  test("prod: a hydrating island mounts with createRoot and runs no diagnostic path", async () => {
    const prev = process.env.PLUMIX_DEV;
    delete process.env.PLUMIX_DEV;
    const events = listenForMismatch();

    // The same divergence that fires the diagnostic in dev; under createRoot
    // React silently replaces the server DOM and no mismatch signal exists.
    const Component = () => <span>CLIENT</span>;
    const el = document.createElement("div");
    el.innerHTML = "<span>SERVER</span>";
    document.body.appendChild(el);

    active = mount(el, { hydrate: true });
    active.render(Component, {}, {});

    await vi.waitFor(() => expect(el.textContent).toBe("CLIENT"));
    expect(events).toHaveLength(0);

    process.env.PLUMIX_DEV = prev;
  });

  test("dev: a client-only island mounts with createRoot and emits no mismatch", async () => {
    const prev = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    const events = listenForMismatch();

    // Client-only ships no server output, so there is nothing to hydrate — it
    // mounts fresh with createRoot even in dev and is never a mismatch source.
    const Component = () => <span>fresh</span>;
    const el = document.createElement("div");
    document.body.appendChild(el);

    active = mount(el, { hydrate: false });
    active.render(Component, {}, {});

    await vi.waitFor(() => expect(el.textContent).toBe("fresh"));
    expect(events).toHaveLength(0);

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
