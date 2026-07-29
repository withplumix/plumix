import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installIslandErrorOverlay } from "./island-overlay.js";

const HOST_TAG = "plumix-dev-error-overlay";

let uninstall: () => void = () => undefined;

// React roots inside the shadow render on the scheduler; give it a macrotask
// to flush before reading the DOM. Mirrors the island-element suite's teardown.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function host(): HTMLElement | null {
  return document.querySelector<HTMLElement>(HOST_TAG);
}

function shadow(): ShadowRoot {
  const el = host();
  if (!el?.shadowRoot) throw new Error("overlay host not mounted");
  return el.shadowRoot;
}

function query(testid: string): HTMLElement | null {
  return shadow().querySelector<HTMLElement>(`[data-testid="${testid}"]`);
}

function island(componentExport: string): HTMLElement {
  const el = document.createElement("plumix-island");
  el.setAttribute("component-export", componentExport);
  return el;
}

function dispatchHydrationError(
  error: unknown,
  element?: HTMLElement,
): boolean {
  return window.dispatchEvent(
    new CustomEvent("plumix:hydration-error", {
      detail: { error, element },
      cancelable: true,
    }),
  );
}

describe("installIslandErrorOverlay", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    uninstall = installIslandErrorOverlay();
  });

  afterEach(async () => {
    uninstall();
    document.body.innerHTML = "";
    await tick();
  });

  test("stays out of the DOM until an island error is captured", () => {
    expect(host()).toBeNull();
  });

  test("captures a hydration error, swallows the default, and shows a corner badge", async () => {
    const notPrevented = dispatchHydrationError(
      new Error("hydrate boom"),
      island("Counter"),
    );
    // dispatchEvent returns false when a listener called preventDefault — the
    // overlay consumes the event so the framework's default console log is
    // suppressed.
    expect(notPrevented).toBe(false);

    await tick();
    const badge = query("plumix-island-overlay-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("1");
    // A badge, not a full-screen takeover: no panel until it is expanded.
    expect(query("plumix-island-overlay-panel")).toBeNull();
  });

  test("expands the badge into a panel that renders the shared error renderer", async () => {
    dispatchHydrationError(new Error("hydrate boom"), island("Counter"));
    await tick();

    query("plumix-island-overlay-badge")?.click();
    await tick();

    const panel = query("plumix-island-overlay-panel");
    expect(panel).not.toBeNull();
    // The shared DevErrorPage renders inside the panel.
    expect(query("plumix-dev-error-message")?.textContent).toBe("hydrate boom");
    // Names the island that failed.
    expect(query("plumix-island-overlay-label")?.textContent).toContain(
      "Counter",
    );
  });

  test("shows the React component stack when the island-error carried one", async () => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-error", {
        detail: {
          error: new Error("render boom"),
          componentStack: "\n    at Counter\n    at App",
          element: island("Counter"),
        },
      }),
    );
    await tick();
    query("plumix-island-overlay-badge")?.click();
    await tick();

    expect(query("plumix-dev-error-component-stack")?.textContent).toContain(
      "at Counter",
    );
  });

  test("renders a hydration mismatch through the shared error page, named and labeled by island", async () => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: {
          element: island("Clock"),
          componentStack: "\n    at Clock\n    at App",
        },
      }),
    );
    await tick();
    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");

    query("plumix-island-overlay-badge")?.click();
    await tick();

    // The shared DevErrorPage renders inside the panel, named as a mismatch…
    expect(query("plumix-dev-error-name")?.textContent).toBe(
      "Hydration mismatch",
    );
    // …the bar names the island that diverged…
    expect(query("plumix-island-overlay-label")?.textContent).toContain(
      "Clock",
    );
    // …and React's component stack points at it.
    expect(query("plumix-dev-error-component-stack")?.textContent).toContain(
      "at Clock",
    );
  });

  test("counts a doubly-dispatched identical mismatch once", async () => {
    const detail = {
      element: island("Clock"),
      componentStack: "\n    at Clock",
    };
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", { detail }),
    );
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: { element: island("Clock"), componentStack: "\n    at Clock" },
      }),
    );
    await tick();

    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");
  });

  test("counts and navigates between multiple distinct errors", async () => {
    dispatchHydrationError(new Error("first boom"), island("Alpha"));
    dispatchHydrationError(new Error("second boom"), island("Beta"));
    await tick();

    const badge = query("plumix-island-overlay-badge");
    expect(badge?.textContent).toContain("2");

    badge?.click();
    await tick();

    // Newest error is shown first.
    expect(query("plumix-dev-error-message")?.textContent).toBe("second boom");
    expect(query("plumix-island-overlay-count")?.textContent).toContain("1");

    query("plumix-island-overlay-next")?.click();
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("first boom");

    query("plumix-island-overlay-prev")?.click();
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("second boom");
  });

  test("keeps the expanded panel pinned to the error being read when a newer one arrives", async () => {
    dispatchHydrationError(new Error("reading this"), island("Alpha"));
    await tick();
    query("plumix-island-overlay-badge")?.click();
    await tick();
    expect(query("plumix-dev-error-message")?.textContent).toBe("reading this");

    // A newer error arrives while the panel is open; it must not swap out.
    dispatchHydrationError(new Error("newer"), island("Beta"));
    await tick();

    expect(query("plumix-dev-error-message")?.textContent).toBe("reading this");
    // The read error shifted from slot 1 to slot 2 of 2.
    expect(query("plumix-island-overlay-count")?.textContent).toContain(
      "2 / 2",
    );
  });

  async function openModal(): Promise<void> {
    query("plumix-island-overlay-badge")?.click();
    await tick();
  }

  test("closes the modal to the indicator on a backdrop press-and-release", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    await openModal();
    expect(query("plumix-island-overlay-panel")).not.toBeNull();

    const backdrop = query("plumix-island-overlay-backdrop");
    backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(query("plumix-island-overlay-panel")).toBeNull();
    expect(query("plumix-island-overlay-badge")).not.toBeNull();
    // Errors are kept — the host stays in the DOM (the indicator remains).
    expect(host()).not.toBeNull();
  });

  test("stays open when a drag starts in the modal and ends on the backdrop", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    await openModal();

    // Press begins inside the modal (selecting stack text), released outside.
    query("plumix-island-overlay-panel")?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    query("plumix-island-overlay-backdrop")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await tick();

    expect(query("plumix-island-overlay-panel")).not.toBeNull();
  });

  test("closes the modal to the indicator with the close button", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    await openModal();

    query("plumix-island-overlay-collapse")?.click();
    await tick();

    expect(query("plumix-island-overlay-panel")).toBeNull();
    expect(query("plumix-island-overlay-badge")).not.toBeNull();
    expect(host()).not.toBeNull();
  });

  test("closes the modal on Escape, keeping the errors", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    await openModal();
    expect(query("plumix-island-overlay-panel")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await tick();

    expect(query("plumix-island-overlay-panel")).toBeNull();
    expect(query("plumix-island-overlay-badge")).not.toBeNull();
  });

  test("deduplicates the same error object dispatched twice", async () => {
    const error = new Error("same boom");
    dispatchHydrationError(error, island("Counter"));
    dispatchHydrationError(error, island("Counter"));
    await tick();

    expect(query("plumix-island-overlay-badge")?.textContent).toContain("1");
  });

  test("captures async window errors and unhandled rejections", async () => {
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("async boom") }),
    );
    // Poll rather than assume one macrotask flushed the render — CI load can
    // stretch the async handler past a single tick.
    await vi.waitFor(() =>
      expect(query("plumix-island-overlay-badge")?.textContent).toContain("1"),
    );

    // jsdom lacks a PromiseRejectionEvent constructor; a plain event with the
    // reason attached is what the listener reads.
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = new Error("rejected boom");
    window.dispatchEvent(rejection);
    await vi.waitFor(() =>
      expect(query("plumix-island-overlay-badge")?.textContent).toContain("2"),
    );
  });

  test("ignores resource-load error events that carry no error object", async () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "404 img" }));
    await tick();
    expect(host()).toBeNull();
  });

  test("resolves the raw browser stack into frames via the dev endpoint", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const body =
        input === "/@plumix-dev-error-stack"
          ? {
              frames: [
                {
                  functionName: "Counter",
                  file: "/proj/src/Counter.tsx",
                  line: 14,
                  column: 2,
                  isVendor: false,
                },
              ],
            }
          : // The excerpt fetch the enhancer fires for the first frame.
            { file: "/proj/src/Counter.tsx", line: 14, lines: [] };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const error = new Error("render boom");
    error.stack =
      "Error: render boom\n    at Counter (http://localhost:5173/src/Counter.tsx?t=1:1:0)";
    dispatchHydrationError(error, island("Counter"));
    // capture → render (raw stack) → POST → resolve → re-render with frames.
    await tick();
    await tick();
    query("plumix-island-overlay-badge")?.click();
    await tick();

    // The overlay now shows the shared frame view with the mapped location.
    const frame = query("plumix-dev-error-frame");
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("data-file")).toBe("/proj/src/Counter.tsx");
    expect(query("plumix-dev-error-stack")).toBeNull();

    vi.unstubAllGlobals();
  });

  test("a late frame resolution does not resurrect a torn-down overlay", async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
    );

    const error = new Error("boom");
    error.stack = "Error: boom\n    at fn (http://localhost:5173/src/a.ts:1:0)";
    dispatchHydrationError(error, island("Counter"));
    await tick();
    expect(host()).not.toBeNull();

    // Tear down while the frame-resolution POST is still in flight.
    uninstall();
    uninstall = () => undefined;
    expect(host()).toBeNull();

    // The POST resolves after teardown — it must not remount the overlay.
    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({
          frames: [
            { functionName: "fn", file: "/src/a.ts", line: 1, isVendor: false },
          ],
        }),
    });
    await tick();
    await tick();
    expect(host()).toBeNull();

    vi.unstubAllGlobals();
  });

  function badgeCount(): HTMLElement | null {
    return query("plumix-island-overlay-badge-count");
  }

  test("pulses the count circle when the error count climbs", async () => {
    dispatchHydrationError(new Error("first"), island("Alpha"));
    await tick();
    expect(badgeCount()?.className).toContain(
      "plumix-island-overlay__badge-count--pulse",
    );

    // A distinct error ticks the count up — the circle pulses again.
    dispatchHydrationError(new Error("second"), island("Beta"));
    await tick();
    expect(badgeCount()?.textContent).toBe("2");
    expect(badgeCount()?.className).toContain(
      "plumix-island-overlay__badge-count--pulse",
    );
  });

  test("does not re-pulse the circle when reopening on a settled count", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();

    // Open and close the modal without any new errors arriving.
    query("plumix-island-overlay-badge")?.click();
    await tick();
    query("plumix-island-overlay-collapse")?.click();
    await tick();

    // The badge is back, but the count is unchanged — no false "arriving" pulse.
    const circle = badgeCount();
    expect(circle).not.toBeNull();
    expect(circle?.className).not.toContain(
      "plumix-island-overlay__badge-count--pulse",
    );
  });

  test("uninstall removes the host and stops capturing", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await tick();
    expect(host()).not.toBeNull();

    uninstall();
    uninstall = () => undefined;
    expect(host()).toBeNull();

    // A later error is no longer captured.
    dispatchHydrationError(new Error("after"), island("Counter"));
    await tick();
    expect(host()).toBeNull();
  });
});
