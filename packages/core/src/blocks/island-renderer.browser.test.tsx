import { useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { IslandRoot } from "./island-renderer.js";
import { mount } from "./island-renderer.js";

describe("island renderer mount()", () => {
  let active: IslandRoot | null = null;

  afterEach(async () => {
    // Unmount + drain a macrotask so React 19's scheduler tears the root
    // down before the next test.
    active?.unmount();
    active = null;
    document.body.innerHTML = "";
    await new Promise((resolve) => setTimeout(resolve, 0));
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

    // Wait for any, then assert the count: polling for `length === 1` would
    // report a duplicate as a timeout.
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events).toHaveLength(1);
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

    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    expect(events).toHaveLength(1);
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

  test("dev: suppressHydrationWarning on a diverging node suppresses the mismatch signal", async () => {
    const prev = process.env.PLUMIX_DEV;
    process.env.PLUMIX_DEV = "1";
    const events = listenForMismatch();

    // `suppressHydrationWarning` is React's documented escape hatch for
    // intentional divergence.
    let commits = 0;
    const Component = () => {
      useEffect(() => {
        commits += 1;
      }, []);
      return <span suppressHydrationWarning>CLIENT</span>;
    };
    const el = document.createElement("div");
    el.innerHTML = "<span>SERVER</span>";
    document.body.appendChild(el);

    active = mount(el, { hydrate: true });
    active.render(Component, {}, {});

    await vi.waitFor(() => expect(commits).toBe(1));
    expect(events).toHaveLength(0);
    // Suppressed divergence keeps the server render for that node.
    expect(el.textContent).toBe("SERVER");

    process.env.PLUMIX_DEV = prev;
  });
});
