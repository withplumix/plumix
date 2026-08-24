// @vitest-environment jsdom
/// <reference lib="dom" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installIslandErrorOverlay } from "./island-overlay.js";

const HOST_TAG = "plumix-dev-error-overlay";

let uninstall: () => void = () => undefined;

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

// React roots inside the shadow commit on the scheduler, so the DOM an
// assertion needs may not be there yet. Poll for it — a loaded CI runner
// outruns any fixed delay. The interval is tightened from vitest's 50ms
// default because every wait here pays it in full.
function shown(testid: string): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const el = query(testid);
      if (!el) throw new Error(`no [data-testid="${testid}"] in the overlay`);
      return el;
    },
    { interval: 10 },
  );
}

function gone(testid: string): Promise<void> {
  return vi.waitFor(
    () => {
      // Not `query`: a torn-down host means the testid is gone, and `shadow()`
      // throwing would read to `waitFor` as "not settled yet".
      const el = host()?.shadowRoot?.querySelector(`[data-testid="${testid}"]`);
      if (el) throw new Error(`[data-testid="${testid}"] still shown`);
    },
    { interval: 10 },
  );
}

async function press(testid: string): Promise<void> {
  (await shown(testid)).click();
}

// Only for the "nothing should have happened" assertions: there is no condition
// to poll for, so let pending work run and then assert the absence.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
    await flush();
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

    const badge = await shown("plumix-island-overlay-badge");
    expect(badge.textContent).toContain("1");
    // A badge, not a full-screen takeover: no panel until it is expanded.
    expect(query("plumix-dev-overlay-panel")).toBeNull();
  });

  test("expands the badge into a panel that renders the shared error renderer", async () => {
    dispatchHydrationError(new Error("hydrate boom"), island("Counter"));
    await press("plumix-island-overlay-badge");
    await shown("plumix-dev-overlay-panel");

    // The shared error body renders inside the panel.
    expect(query("plumix-dev-error-message")?.textContent).toBe("hydrate boom");
    // Names the island that failed.
    expect(query("plumix-dev-overlay-label")?.textContent).toContain("Counter");
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
    await press("plumix-island-overlay-badge");

    const stack = await shown("plumix-dev-error-component-stack");
    expect(stack.textContent).toContain("at Counter");
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
    const badge = await shown("plumix-island-overlay-badge");
    expect(badge.textContent).toContain("1");

    badge.click();
    await shown("plumix-dev-overlay-panel");

    // The shared error body renders inside the panel, named as a mismatch…
    expect(query("plumix-dev-error-name")?.textContent).toBe(
      "Hydration mismatch",
    );
    // …the bar names the island that diverged…
    expect(query("plumix-dev-overlay-label")?.textContent).toContain("Clock");
    // …and React's component stack points at it.
    expect(query("plumix-dev-error-component-stack")?.textContent).toContain(
      "at Clock",
    );
    // Without a captured HTML pair, the diff section is absent (#1668).
    expect(query("plumix-dev-error-hydration-diff")).toBeNull();
  });

  test("renders the server-vs-client diff when the mismatch carried the HTML pair", async () => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: {
          element: island("Clock"),
          componentStack: "\n    at Clock\n    at App",
          server: "<span>SERVER</span>",
          client: "<span>CLIENT</span>",
        },
      }),
    );
    await press("plumix-island-overlay-badge");
    await shown("plumix-dev-error-hydration-diff");

    // Both captured renders show, escaped as text rather than re-rendered.
    expect(query("plumix-dev-error-hydration-server")?.textContent).toContain(
      "<span>SERVER</span>",
    );
    expect(query("plumix-dev-error-hydration-client")?.textContent).toContain(
      "<span>CLIENT</span>",
    );
  });

  test("shows a slim dialog — label, error, diff — with no server-only context sections", async () => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: {
          element: island("Clock"),
          componentStack: "\n    at Clock\n    at App",
          server: "<span>SERVER</span>",
          client: "<span>CLIENT</span>",
        },
      }),
    );
    await press("plumix-island-overlay-badge");

    // The dialog shows the island label, the error, and the hydration diff…
    const label = await shown("plumix-dev-overlay-label");
    expect(label.textContent).toContain("Clock");
    expect(query("plumix-dev-error-message")).not.toBeNull();
    expect(query("plumix-dev-error-hydration-diff")).not.toBeNull();
    // …and none of the server-only context sections the full page renders — the
    // client dialog composes the slim body, never the full DevErrorPage (#1678).
    expect(query("plumix-dev-error-request")).toBeNull();
    expect(query("plumix-dev-error-route")).toBeNull();
    expect(query("plumix-dev-error-database")).toBeNull();
    expect(query("plumix-dev-error-timeline")).toBeNull();
    expect(query("plumix-dev-error-app")).toBeNull();
    expect(query("plumix-dev-error-panels")).toBeNull();
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

    const badge = await shown("plumix-island-overlay-badge");
    expect(badge.textContent).toContain("1");
  });

  test("counts and navigates between multiple distinct errors", async () => {
    dispatchHydrationError(new Error("first boom"), island("Alpha"));
    dispatchHydrationError(new Error("second boom"), island("Beta"));

    const badge = await shown("plumix-island-overlay-badge");
    expect(badge.textContent).toContain("2");

    badge.click();
    await shown("plumix-dev-overlay-panel");

    // Newest error is shown first.
    expect(query("plumix-dev-error-message")?.textContent).toBe("second boom");
    expect(query("plumix-island-overlay-count")?.textContent).toContain("1");

    await press("plumix-island-overlay-next");
    await vi.waitFor(
      () =>
        expect(query("plumix-dev-error-message")?.textContent).toBe(
          "first boom",
        ),
      { interval: 10 },
    );

    await press("plumix-island-overlay-prev");
    await vi.waitFor(
      () =>
        expect(query("plumix-dev-error-message")?.textContent).toBe(
          "second boom",
        ),
      { interval: 10 },
    );
  });

  test("keeps the expanded panel pinned to the error being read when a newer one arrives", async () => {
    dispatchHydrationError(new Error("reading this"), island("Alpha"));
    await press("plumix-island-overlay-badge");
    const message = await shown("plumix-dev-error-message");
    expect(message.textContent).toBe("reading this");

    // A newer error arrives while the panel is open; it must not swap out.
    dispatchHydrationError(new Error("newer"), island("Beta"));
    // The read error shifting from slot 1 to slot 2 of 2 is the new one landing.
    await vi.waitFor(
      () =>
        expect(query("plumix-island-overlay-count")?.textContent).toContain(
          "2 / 2",
        ),
      { interval: 10 },
    );
    expect(query("plumix-dev-error-message")?.textContent).toBe("reading this");
  });

  async function openModal(): Promise<void> {
    await press("plumix-island-overlay-badge");
    await shown("plumix-dev-overlay-panel");
  }

  test("closes the modal to the indicator on a backdrop press-and-release", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await openModal();

    const backdrop = await shown("plumix-dev-overlay-backdrop");
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await gone("plumix-dev-overlay-panel");
    expect(query("plumix-island-overlay-badge")).not.toBeNull();
    // Errors are kept — the host stays in the DOM (the indicator remains).
    expect(host()).not.toBeNull();
  });

  test("stays open when a drag starts in the modal and ends on the backdrop", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await openModal();

    const panel = await shown("plumix-dev-overlay-panel");
    const backdrop = await shown("plumix-dev-overlay-backdrop");

    // Press begins inside the modal (selecting stack text), released outside.
    panel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(query("plumix-dev-overlay-panel")).not.toBeNull();
  });

  test("closes the modal to the indicator with the close button", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await openModal();

    await press("plumix-dev-overlay-close");

    await gone("plumix-dev-overlay-panel");
    expect(query("plumix-island-overlay-badge")).not.toBeNull();
    expect(host()).not.toBeNull();
  });

  test("closes the modal on Escape, keeping the errors", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await openModal();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    await gone("plumix-dev-overlay-panel");
    expect(query("plumix-island-overlay-badge")).not.toBeNull();
  });

  test("deduplicates the same error object dispatched twice", async () => {
    const error = new Error("same boom");
    dispatchHydrationError(error, island("Counter"));
    dispatchHydrationError(error, island("Counter"));

    const badge = await shown("plumix-island-overlay-badge");
    expect(badge.textContent).toContain("1");
  });

  test("captures async window errors and unhandled rejections", async () => {
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("async boom") }),
    );
    const badge = await shown("plumix-island-overlay-badge");
    expect(badge.textContent).toContain("1");

    // jsdom lacks a PromiseRejectionEvent constructor; a plain event with the
    // reason attached is what the listener reads.
    const rejection = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    rejection.reason = new Error("rejected boom");
    window.dispatchEvent(rejection);
    await vi.waitFor(
      () =>
        expect(query("plumix-island-overlay-badge")?.textContent).toContain(
          "2",
        ),
      { interval: 10 },
    );
  });

  test("ignores resource-load error events that carry no error object", async () => {
    window.dispatchEvent(new ErrorEvent("error", { message: "404 img" }));
    await flush();
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
    await openModal();

    // capture → render (raw stack) → POST → resolve → re-render with the shared
    // frame view.
    const frame = await shown("plumix-dev-error-frame");
    expect(frame.getAttribute("data-file")).toBe("/proj/src/Counter.tsx");
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
    await shown("plumix-island-overlay-badge");

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
    await flush();
    expect(host()).toBeNull();

    vi.unstubAllGlobals();
  });

  const PULSE = "plumix-island-overlay__badge-count--pulse";

  test("pulses the count circle when the error count climbs", async () => {
    dispatchHydrationError(new Error("first"), island("Alpha"));
    const circle = await shown("plumix-island-overlay-badge-count");
    expect(circle.className).toContain(PULSE);

    // A distinct error ticks the count up — the circle pulses again.
    dispatchHydrationError(new Error("second"), island("Beta"));
    await vi.waitFor(
      () =>
        expect(query("plumix-island-overlay-badge-count")?.textContent).toBe(
          "2",
        ),
      { interval: 10 },
    );
    expect(query("plumix-island-overlay-badge-count")?.className).toContain(
      PULSE,
    );
  });

  test("does not re-pulse the circle when reopening on a settled count", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));

    // Open and close the modal without any new errors arriving.
    await openModal();
    await press("plumix-dev-overlay-close");
    await gone("plumix-dev-overlay-panel");

    // The badge is back, but the count is unchanged — no false "arriving" pulse.
    const circle = await shown("plumix-island-overlay-badge-count");
    expect(circle.className).not.toContain(PULSE);
  });

  test("uninstall removes the host and stops capturing", async () => {
    dispatchHydrationError(new Error("boom"), island("Counter"));
    await shown("plumix-island-overlay-badge");

    uninstall();
    uninstall = () => undefined;
    expect(host()).toBeNull();

    // A later error is no longer captured.
    dispatchHydrationError(new Error("after"), island("Counter"));
    await flush();
    expect(host()).toBeNull();
  });
});
